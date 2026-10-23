import { useCallback, useEffect, useState } from "react";
import { api, type SessionUser } from "../api.js";

// 登录态：以 /api/auth/me 为准（Cookie 是 httpOnly 的，前端无法自检）。
// 会话是服务端可撤销的，所以登出/改密码后前端只需重新取一次。
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((next) => {
        if (alive) setUser(next);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setUser(await api.login(username, password));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // 改名后同步顶部账号显示：会话按 user_id 关联，服务端不需要重新登录
  const rename = useCallback((username: string) => {
    setUser({ username });
  }, []);

  return { user, loading, login, logout, rename };
}
