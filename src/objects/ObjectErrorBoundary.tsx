import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/state/debugStore";

interface Props {
  objectId: string;
  prompt?: string;
  /** Called when the boundary trips so the parent can silently remove the object. */
  onError: (id: string) => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Per-object React error boundary (Tech Doc §5). A faulty generated object cannot blank the
 * canvas — on a render error we log a structured entry, notify the parent to remove the object
 * silently, and render nothing.
 *
 * NOTE: React boundaries only catch errors thrown during render/lifecycle. Async failures
 * (loaders, physics asserts) are caught separately with try/catch and routed to logError().
 */
export class ObjectErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError({
      objectId: this.props.objectId,
      prompt: this.props.prompt,
      phase: "render",
      level: "error",
      message: error.message || "Object render error",
      stack: (error.stack ?? "") + "\n" + (info.componentStack ?? ""),
    });
    // Defer the parent removal so we don't setState during another component's render.
    const { onError, objectId } = this.props;
    queueMicrotask(() => onError(objectId));
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
