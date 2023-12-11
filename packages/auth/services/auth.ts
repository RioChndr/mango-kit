import { ResponseError } from "../../../src/type.ts";
import { oak } from "../deps.ts";
import { AuthModel } from "./model.ts";
import { UserInfoProviderGoogle } from "./provider-type.ts";
import { SessionsService } from "./sessions.ts";

export class AuthService {
  session!: SessionsService;
  model!: AuthModel;
  constructor(
    { session, model }: { session: SessionsService; model: AuthModel },
  ) {
    this.session = session;
    this.model = model;
  }

  async loginWithGoogle(ctx: oak.Context) {
    const userInfo: UserInfoProviderGoogle = ctx.state.user;

    if (!userInfo.email) {
      throw new ResponseError("Email not found from google", 400, {
        error: "email_not_found",
      });
    }
    if (!userInfo.id) {
      throw new ResponseError("Id not found from google", 400, {
        error: "id_not_found",
      });
    }

    const { user } = await this.model.createUserWithProvider({
      userInfo: {
        email: userInfo.email ?? "",
        confirmed_at: new Date(),
      },
      provider: {
        id: userInfo.id?.toString() || "",
        identity_data: userInfo,
        provider: "google",
        email: userInfo.email ?? "",
        last_sign_in_at: new Date(),
      },
    });
    const token = await this.session.createSession({ user });
    const result = this.session.issueingToken({
      accessToken: token.accessToken.token,
      refreshToken: token.refreshToken.token,
      expireAt: token.accessToken.expireAt,
    });
    ctx.response.body = result;
  }

  /** Only get the token */
  static async getAuthorization(ctx: oak.Context, next: () => void) {
    const authorization = ctx.request.headers.get("authorization") || "";
    const token = authorization.replace("Bearer ", "");
    ctx.state.token = token;
    await next();
  }

  async requestRefreshToken(ctx: oak.Context) {
    const refreshToken = ctx.state.token;
    const token = await this.session.refreshTokenSession(refreshToken);
    const result = this.session.issueingToken({
      accessToken: token.accessToken.token,
      refreshToken: token.refreshToken.token,
      expireAt: token.accessToken.expireAt,
    });

    ctx.response.body = result;
  }

  async logout(ctx: oak.Context) {
    const token = ctx.state.token;
    await this.session.logout(token);
    ctx.response.body = { message: "logout success" };
  }
}
