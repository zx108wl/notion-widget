import { Component, type ReactNode } from "react";
import { Typography } from "antd";

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

// 动态加载的自定义控件可能抛错，用 ErrorBoundary 隔离，避免整页白屏
export class ControlErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("自定义控件渲染失败", error);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback?.(this.state.error) ?? (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            自定义控件渲染失败：{this.state.error.message}
          </Typography.Text>
        )
      );
    }
    return this.props.children;
  }
}
