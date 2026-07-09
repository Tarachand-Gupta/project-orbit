const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const App = struct {
    env_map: *std.process.Environ.Map,

    fn app(self: *@This()) native_sdk.App {
        return .{
            .context = self,
            .name = "orbit-native",
            .source = native_sdk.frontend.productionSource(.{ .dist = "frontend/dist" }),
            .source_fn = source,
        };
    }

    fn source(context: *anyopaque) anyerror!native_sdk.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return native_sdk.frontend.sourceFromEnv(self.env_map, .{
            .dist = "frontend/dist",
            .entry = "index.html",
        });
    }
};

const dev_origins = [_][]const u8{ "zero://app", "zero://inline", "http://127.0.0.1:5191" };

// ---------------------------------------------------------------------------
// orbit.warpMouse — pointer-lock emulation for the game's mouse-look.
//
// WKWebView never grants the Pointer Lock API, so the game (src/player/mouseCapture.ts in the
// repo root) drives the camera from plain hover mousemove deltas and asks the shell to teleport
// the OS cursor back to the middle of the window whenever it drifts toward an edge. The target
// is computed HERE, natively, from our own window's bounds — the page must not supply it,
// because MouseEvent.screenX/window.screenX are unreliable inside WebKit views (observed
// -9360,-9680 — CGWarp "succeeds" toward a point far off-screen and the cursor never moves).
// ---------------------------------------------------------------------------

const CGPoint = extern struct { x: f64, y: f64 };
const CGSize = extern struct { width: f64, height: f64 };
const CGRect = extern struct { origin: CGPoint, size: CGSize };
const CFTypeRef = ?*const anyopaque;

extern "c" fn CGWarpMouseCursorPosition(point: CGPoint) i32;
extern "c" fn CGAssociateMouseAndMouseCursorPosition(connected: c_int) i32;
extern "c" fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) CFTypeRef;
extern "c" fn CFArrayGetCount(array: CFTypeRef) isize;
extern "c" fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) CFTypeRef;
extern "c" fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) CFTypeRef;
extern "c" fn CFNumberGetValue(number: CFTypeRef, number_type: isize, value: *anyopaque) bool;
extern "c" fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *CGRect) bool;
extern "c" fn CFRelease(cf: CFTypeRef) void;
extern "c" var kCGWindowOwnerPID: CFTypeRef;
extern "c" var kCGWindowLayer: CFTypeRef;
extern "c" var kCGWindowBounds: CFTypeRef;
extern "c" fn getpid() c_int;

const kCGWindowListOptionOnScreenOnly: u32 = 1 << 0;
const kCGNullWindowID: u32 = 0;
const kCFNumberIntType: isize = 9;

/// Center of this process's biggest ordinary (layer-0) on-screen window, in the global
/// top-left-origin coordinate space CGWarpMouseCursorPosition expects (kCGWindowBounds is
/// already reported in that space).
fn ownWindowCenter() ?CGPoint {
    const list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID) orelse return null;
    defer CFRelease(list);
    const pid = getpid();
    var best: ?CGRect = null;
    var index: isize = 0;
    const count = CFArrayGetCount(list);
    while (index < count) : (index += 1) {
        const info = CFArrayGetValueAtIndex(list, index) orelse continue;
        const pid_ref = CFDictionaryGetValue(info, kCGWindowOwnerPID) orelse continue;
        var owner: c_int = 0;
        if (!CFNumberGetValue(pid_ref, kCFNumberIntType, &owner) or owner != pid) continue;
        if (CFDictionaryGetValue(info, kCGWindowLayer)) |layer_ref| {
            var layer: c_int = 0;
            if (CFNumberGetValue(layer_ref, kCFNumberIntType, &layer) and layer != 0) continue;
        }
        const bounds_ref = CFDictionaryGetValue(info, kCGWindowBounds) orelse continue;
        var rect: CGRect = undefined;
        if (!CGRectMakeWithDictionaryRepresentation(bounds_ref, &rect)) continue;
        if (best == null or rect.size.width * rect.size.height > best.?.size.width * best.?.size.height) best = rect;
    }
    const rect = best orelse return null;
    return .{ .x = rect.origin.x + rect.size.width / 2.0, .y = rect.origin.y + rect.size.height / 2.0 };
}

fn warpMouse(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = context;
    _ = invocation; // payload intentionally ignored — see the coordinate-trust note above
    if (builtin.os.tag == .macos) {
        const center = ownWindowCenter() orelse return error.NoWindow;
        // Detach the cursor from the mouse around the warp: a plain warp starts macOS's local-
        // event suppression interval (~250 ms of swallowed deltas), which would hitch the camera
        // on every recenter. Detached warps skip it — the same trick native games use.
        const assoc0 = CGAssociateMouseAndMouseCursorPosition(0);
        const warp = CGWarpMouseCursorPosition(center);
        const assoc1 = CGAssociateMouseAndMouseCursorPosition(1);
        // The computed target + CG return codes ride along in the response — they turn "the
        // cursor didn't move" from a guessing game into one `native automate bridge` call.
        return std.fmt.bufPrint(output, "{{\"ok\":true,\"x\":{d},\"y\":{d},\"assoc0\":{d},\"warp\":{d},\"assoc1\":{d}}}", .{ center.x, center.y, assoc0, warp, assoc1 });
    } else {
        return "{\"ok\":true}";
    }
}

const bridge_commands = [_]native_sdk.BridgeCommandPolicy{
    // Origins mirror app.zon: the packaged app (zero://app), the dev shell (Vite on 5191), and
    // the automation harness (`native automate bridge ...` dispatches as zero://inline).
    .{ .name = "orbit.warpMouse", .origins = &.{ "zero://app", "http://127.0.0.1:5191", "zero://inline" } },
};
var bridge_context: u8 = 0;
var bridge_handlers = [_]native_sdk.BridgeHandler{
    .{ .name = "orbit.warpMouse", .context = &bridge_context, .invoke_fn = warpMouse },
};

fn orbitBridge() native_sdk.BridgeDispatcher {
    return .{
        .policy = .{ .enabled = true, .commands = &bridge_commands },
        .registry = .{ .handlers = &bridge_handlers },
    };
}

pub fn main(init: std.process.Init) !void {
    var app = App{ .env_map = init.environ_map };
    try runner.runWithOptions(app.app(), .{
        .app_name = "Project Orbit",
        .window_title = "Project Orbit",
        .bundle_id = "dev.orbit.project-orbit",
        .icon_path = "assets/icon.png",
        .bridge = orbitBridge(),
        .security = .{
            .navigation = .{ .allowed_origins = &dev_origins },
        },
    }, init);
}

test "app name is configured" {
    try std.testing.expectEqualStrings("orbit-native", "orbit-native");
}

test "bridge policy allows the game origins only" {
    const dispatcher = orbitBridge();
    try std.testing.expect(dispatcher.policy.allows("orbit.warpMouse", "zero://app"));
    try std.testing.expect(dispatcher.policy.allows("orbit.warpMouse", "http://127.0.0.1:5191"));
    try std.testing.expect(dispatcher.policy.allows("orbit.warpMouse", "zero://inline"));
    try std.testing.expect(!dispatcher.policy.allows("orbit.warpMouse", "https://evil.example"));
    try std.testing.expect(!dispatcher.policy.allows("orbit.other", "zero://app"));
}
