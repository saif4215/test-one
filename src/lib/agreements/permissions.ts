/** Role and access rules. Pure functions so they are easy to test; the server enforces them on every action. */

export const ROLES = ["admin", "attorney", "buyer", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  attorney: "Attorney / reviewer",
  buyer: "Buyer",
  seller: "Seller",
};

export type AccessLevel = "admin" | "owner" | "editor" | "viewer";

export interface Actor {
  id: string;
  role: Role;
}

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

export const canCreateAgreement = (role: Role) => role === "admin" || role === "attorney" || role === "buyer";
export const canAdminister = (role: Role) => role === "admin";

export function capabilities(level: AccessLevel | null) {
  const edit = level === "admin" || level === "owner" || level === "editor";
  return {
    view: level !== null,
    edit,
    send: edit,
    cancel: level === "admin" || level === "owner",
    manageAccess: level === "admin" || level === "owner",
  };
}
export type Capabilities = ReturnType<typeof capabilities>;
