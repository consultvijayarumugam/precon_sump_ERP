/** What the auth guard attaches to `request.user` after verifying a JWT. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: { key: string; name: string };
  /** Effective permission tags: role tags + granted - revoked. */
  permissions: string[];
  /** Modules the user can see, derived from their permission tags. */
  modules: string[];
  /** Details of the token used for this request (needed for logout). */
  token: { jti: string; expiresAt: Date };
}

export interface JwtPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}
