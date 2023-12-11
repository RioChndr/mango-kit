import { Payload, getNumericDate } from "https://deno.land/x/djwt@v3.0.0/mod.ts";
import { ResponseError } from "../../../src/type.ts";
import { Djwt, Redis } from "../deps.ts";
import { AuthModel, UserModel } from "./model.ts";

interface PayloadJwtToken extends Payload{
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  jti: string;
	aud: string;
  sessionid: string;
  role: string[];
}

export class SessionsService {
  authModel!: AuthModel;
  redis!: Redis.Redis;
  keyJwt!: CryptoKey;

  constructor(
    { authModel, redis }: {
      authModel: AuthModel;
      redis: Redis.Redis;
    },
  ) {
    this.authModel = authModel;
    this.redis = redis;
  }

  static async getKey(keyLocation: string) {
    const fileData = Deno.readFileSync(keyLocation);
    if (!fileData) {
      throw new Error(
        "Key not found, please run using `packages/auth/scripts/generate-key.ts",
      );
    }
    return await crypto.subtle.importKey(
      "raw",
      fileData,
      { name: "HMAC", hash: "SHA-512" },
      true,
      ["sign", "verify"],
    );
  }

  // `iss` (issuer): Issuer of the JWT
  // `sub` (subject): Subject of the JWT (the user)
  // `aud` (audience): Recipient for which the JWT is intended
  // `exp` (expiration time): Time after which the JWT expires
  // `nbf` (not before time): Time before which the JWT must not be accepted for processing
  // `iat` (issued at time): Time at which the JWT was issued; can be used to determine age of the JWT
  // `jti` (JWT ID): Unique identifier; can be used to prevent the JWT from being replayed (allows a token to be used only once)

  async generateToken(options: {
    iss: string;
    /** user id */
    sub: string;
    aud: string;
    role: string[];
    sessionId: string;
    expIn: number; // second
  }) {
    const jti = crypto.randomUUID();
    const expireAt = getNumericDate(options.expIn)
    const payload: PayloadJwtToken = {
      iss: options.iss,
      sub: options.sub,
      exp: expireAt,
      iat: getNumericDate(new Date()),
			aud: options.aud,
      jti,
      sessionid: options.sessionId,
      role: options.role,
    };

    const token = await Djwt.create(
      {
        alg: "HS512",
				type: "JWT"
      },
      payload,
      this.keyJwt,
    );

    return {
      token,
      payload,
      expireAt,
    };
  }

  public expAccessToken = 60 * 60;
  public expRefreshToken = 60 * 60 * 24 * 30;

  /**
   * Create new session. but if sessionId is provided, it will be used instead of generating new one
   * @param option
   * @returns
   */
  async createSession(
    option: {
      user: Pick<UserModel, "id" | "role">;
      issuer?: string;
      sessionId?: string;
    },
  ) {
    const sessionId = option.sessionId ?? crypto.randomUUID();
    const accessToken = await this.generateToken({
      aud: "access",
      iss: option.issuer || "iss-undefined",
      sub: option.user.id,
      role: option.user.role ?? [],
      sessionId,
      expIn: this.expAccessToken,
    });

    const refreshToken = await this.generateToken({
      aud: "refresh",
      iss: option.issuer || "iss-undefined",
      sub: option.user.id,
      role: option.user.role ?? [],
      sessionId,
      expIn: this.expRefreshToken,
    });

    await this.saveSessionForUser(
      new CacheLocation({
        user: option.user,
        sessionId: sessionId,
        accessToken: accessToken.payload,
        refreshToken: refreshToken.payload,
      }),
    );

    return {
      sessionId: sessionId,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  issueingToken(opt: {
    accessToken: string;
    refreshToken: string;
    expireAt: number;
  }) {
    return {
      access_token: opt.accessToken,
      refresh_token: opt.refreshToken,
      expired_at: opt.expireAt * 1000,
      token_type: "Bearer",
    };
  }

  async saveSessionForUser(cacheLocation: CacheLocation) {
    if (
      !cacheLocation.user || !cacheLocation.sessionId ||
      !cacheLocation.accessToken || !cacheLocation.refreshToken
    ) {
      throw new Error("invalid cache location");
    }
    await this.redis.sadd(cacheLocation.usersSession, cacheLocation.sessionId!);

    await this.redis.hset(
      cacheLocation.sessionIdLocation, //
      ["refresh-token", cacheLocation.refreshTokenLocation], //
      ["access-token", cacheLocation.accessTokenLocation], //
      ["user-id", cacheLocation.user!.id], //
    );

    // set refresh token
    await this.redis.hset(
      cacheLocation.refreshTokenLocation, //
      ["user-id", cacheLocation.user!.id], //
      ["session-id", cacheLocation.sessionId!], //
    );
    await this.redis.expire(
      cacheLocation.refreshTokenLocation,
      this.expRefreshToken,
    );

    // set access token
    await this.redis.hset(
      cacheLocation.accessTokenLocation, //
      ["user-id", cacheLocation.user!.id], //
      ["session-id", cacheLocation.sessionId!], //
    );
    await this.redis.expire(
      cacheLocation.accessTokenLocation,
      this.expAccessToken,
    );
  }

  async verifyJwt(token: string, aud: string): Promise<PayloadJwtToken> {
    let payload: PayloadJwtToken;
    try{
      payload = await Djwt.verify(token, this.keyJwt, {
        audience: aud,
      }) as PayloadJwtToken;
      if (!payload || !payload.sub || !payload.jti || payload.aud !== aud) throw new SessionErrorTokenNotValid();
    }catch(e){
      console.log(e)
      if(e.message === 'The jwt is expired.'){
        throw new SessionErrorTokenExpired();
      }
      throw new SessionErrorTokenNotValid();
    }
    return payload;
  }

  /** used at middleware */
  async verifyToken(token: string) {
    const payload: PayloadJwtToken = await this.verifyJwt(token, "access")
    const session = await this.getSessionFromAccessToken(
      payload.sub,
      payload.jti,
    );
    if(!session) throw new SessionErrorSessionNotFound();
    const user = await this.authModel.getUserUnique("id", payload.sub);
    if (!user) throw new SessionErrorUserNotFound();
    return {user, session};
  }

  async getSessionFromAccessToken(userId: string, accessToken: string) {
    const cacheLocation = new CacheLocation({
      user: { id: userId },
      accessToken: { jti: accessToken },
    });

    const accessTokenCache = await this.redis.hget(
      cacheLocation.accessTokenLocation,
      "session-id",
    );
    if (!accessTokenCache) return undefined;
    return accessTokenCache;
  }

  async verifyRefreshToken(token: string) {
    const payload: PayloadJwtToken = await this.verifyJwt(token, "refresh")
    const session = await this.getSessionFromRefreshToken(
      payload.sub,
      payload.jti,
    );
    if (!session) throw new SessionErrorSessionNotFound();
    const user = await this.authModel.getUserUnique("id", payload.sub);
    if (!user) throw new SessionErrorUserNotFound();
    return { user, session };
  }

  async getSessionFromRefreshToken(userId: string, refreshToken: string) {
    const cacheLocation = new CacheLocation({
      user: { id: userId },
      refreshToken: { jti: refreshToken },
    });

    const accessTokenCache = await this.redis.hget(
      cacheLocation.refreshTokenLocation,
      "session-id",
    );
    if (!accessTokenCache) throw new SessionErrorSessionNotFound();
    return accessTokenCache;
  }

  async clearTokenFromSession(sessionId: string, userId: string){
    const cacheLocation = new CacheLocation({
      sessionId,
      user: { id: userId },
    })
    const accessToken = await this.redis.hget(cacheLocation.sessionIdLocation, "access-token")
    const refreshToken = await this.redis.hget(cacheLocation.sessionIdLocation, "refresh-token")

    if(accessToken) await this.redis.del(accessToken)
    if(refreshToken) await this.redis.del(refreshToken)
    return true;
  }

  async clearSession(sessionId: string, userId: string){
    const cacheLocation = new CacheLocation({
      sessionId,
      user: { id: userId },
    })

    await this.redis.del(cacheLocation.sessionIdLocation)
    await this.redis.srem(cacheLocation.usersSession, sessionId)
    return true;
  }

  async logout(accessToken: string){
    const verify = await this.verifyToken(accessToken);
    if (!verify) throw new SessionErrorTokenNotValid();

    await this.clearTokenFromSession(verify.session, verify.user.id)
    await this.clearSession(verify.session, verify.user.id);
    return true;
  }

  async refreshTokenSession(
    refreshToken: string,
  ) {
    const verify = await this.verifyRefreshToken(refreshToken);
    if (!verify || !verify.session || !verify.user) throw new SessionErrorTokenNotValid();

    await this.clearTokenFromSession(verify.session, verify.user.id)

    return this.createSession({
      user: verify.user,
      issuer: "website",
      sessionId: verify.session,
    });
  }
}

export class CacheLocation {
  user?: Pick<UserModel, "id">;
  sessionId?: string;
  accessToken?: Pick<PayloadJwtToken, "jti">;
  refreshToken?: Pick<PayloadJwtToken, "jti">;
  constructor(options?: {
    user?: Pick<UserModel, "id">;
    sessionId?: string;
    accessToken?: Pick<PayloadJwtToken, "jti">;
    refreshToken?: Pick<PayloadJwtToken, "jti">;
  }) {
    this.user = options?.user;
    this.sessionId = options?.sessionId;
    this.accessToken = options?.accessToken;
    this.refreshToken = options?.refreshToken;
  }

  get usersSession() {
    return `user:${this.user?.id}:sessions`;
  }

  get sessionIdLocation() {
    return `user:${this.user?.id}:session:${this.sessionId}`;
  }
  get accessTokenLocation() {
    return `user:${this.user?.id}:access-token:${this.accessToken?.jti}`;
  }
  get refreshTokenLocation() {
    return `user:${this.user?.id}:refresh-token:${this.refreshToken?.jti}`;
  }
}

export class SessionErrorTokenNotValid extends ResponseError {
  constructor() {
    super("Token authorization is not valid", 400);
  }
}

export class SessionErrorTokenExpired extends ResponseError {
  constructor() {
    super("Token authorization is expired, try to refresh it", 400);
  }
}

export class SessionErrorTokenNotMatch extends ResponseError {
  constructor() {
    super("Token authorization is not match", 400);
  }
}

export class SessionErrorUserNotFound extends ResponseError {
  constructor() {
    super("User not found", 400);
  }
}

export class SessionErrorSessionNotFound extends ResponseError {
  constructor() {
    super("Session not found", 400);
  }
}
