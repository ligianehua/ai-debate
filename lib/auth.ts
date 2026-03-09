/**
 * 轻量级会员系统（基于 localStorage）
 * 适合个人/演示项目，无需后端数据库
 */

export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar: string; // emoji avatar
  createdAt: number;
}

interface StoredUser extends User {
  password: string; // 简单哈希
}

const USERS_KEY = "debate_users";
const CURRENT_USER_KEY = "debate_current_user";

// 简单的字符串哈希（非安全级别，仅用于本地演示）
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// 随机头像 emoji
const AVATARS = ["🦊", "🐱", "🐶", "🐼", "🦁", "🐯", "🐮", "🐷", "🐸", "🐵", "🦄", "🐲", "🦅", "🐧", "🐬", "🦋"];

function getUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** 注册 */
export function register(
  username: string,
  password: string,
  nickname: string
): { success: boolean; error?: string; user?: User } {
  if (!username.trim() || !password.trim()) {
    return { success: false, error: "用户名和密码不能为空" };
  }
  if (username.length < 2 || username.length > 20) {
    return { success: false, error: "用户名需要 2-20 个字符" };
  }
  if (password.length < 4) {
    return { success: false, error: "密码至少 4 个字符" };
  }

  const users = getUsers();
  if (users.find((u) => u.username === username.trim())) {
    return { success: false, error: "用户名已存在" };
  }

  const newUser: StoredUser = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: username.trim(),
    nickname: nickname.trim() || username.trim(),
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    password: simpleHash(password),
    createdAt: Date.now(),
  };

  users.push(newUser);
  saveUsers(users);

  const { password: _, ...user } = newUser;
  void _;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  return { success: true, user };
}

/** 登录 */
export function login(
  username: string,
  password: string
): { success: boolean; error?: string; user?: User } {
  if (!username.trim() || !password.trim()) {
    return { success: false, error: "请输入用户名和密码" };
  }

  const users = getUsers();
  const found = users.find(
    (u) => u.username === username.trim() && u.password === simpleHash(password)
  );

  if (!found) {
    return { success: false, error: "用户名或密码错误" };
  }

  const { password: _, ...user } = found;
  void _;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  return { success: true, user };
}

/** 获取当前登录用户 */
export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(CURRENT_USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/** 登出 */
export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

/** 更新昵称 */
export function updateNickname(newNickname: string): User | null {
  const user = getCurrentUser();
  if (!user) return null;

  user.nickname = newNickname.trim() || user.username;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));

  // 同步到 users 列表
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users[idx].nickname = user.nickname;
    saveUsers(users);
  }

  return user;
}
