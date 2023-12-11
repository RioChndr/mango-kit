import { sleep } from "https://deno.land/x/sleep@v1.2.1/sleep.ts";
import {
  createRedisContainer,
  RedisContainer
} from "../../../utils/docker-test.ts";
import { Redis } from "../../deps.ts";
import { AuthModel, UserModel } from "../../services/model.ts";
import { CacheLocation, SessionsService } from "../../services/sessions.ts";
import {
  afterAll,
  assert,
  assertExists,
  beforeAll,
  describe,
  it
} from "../deps-dev.ts";

describe(
  "Test auth sessions",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    let redisServer: RedisContainer;
    let redis: Redis.Redis;
    let model: AuthModel;
    let sessionService: SessionsService;
    let key: CryptoKey;

    beforeAll(async () => {
      if (!key) {
        key = await crypto.subtle.generateKey(
          { name: "HMAC", hash: "SHA-512" },
          true,
          ["sign", "verify"],
        );
      }

      redisServer = await createRedisContainer({
        imageName: "test_redis_model_0128321",
        port: 6379,
      });

      redis = await Redis.connect({
        hostname: "localhost",
        port: redisServer.port,
      });
			await redis.flushall(true)
      sessionService = new SessionsService({
        authModel: model,
        redis,
      });
      sessionService.keyJwt = key;
      await sleep(2);
    });
    afterAll(async () => {
      // await redis.shutdown('NOSAVE');
      await redisServer.stop();
    });

    it("test redis connection", async () => {
      await redis.set("test", "test");
      const test = await redis.get("test");
      assert(test == "test");
    });

    it("Should able generate token and save to redis", async () => {
      const userTesting = {
        id: "f3f4d3c2-4d5d-4c6e-9f3e-8c7a6b5a4d1e",
        role: ["user"],
      } as UserModel;

      // mocking
      sessionService.authModel = {
        getUserUnique: (..._: unknown[]) =>
          new Promise((resolve) => resolve(userTesting)),
      } as AuthModel;

      const session = await sessionService.createSession({
        user: userTesting,
        issuer: "testing",
      });

      assert(session.accessToken.payload.aud === "access");
      assert(session.refreshToken.payload.aud === "refresh");
      assert(session.accessToken.payload.iss === "testing");
      assert(session.refreshToken.payload.iss === "testing");

      const cacheSession1 = new CacheLocation({
        user: userTesting,
        sessionId: session.sessionId,
        accessToken: session.accessToken.payload,
        refreshToken: session.refreshToken.payload,
      });

      const sessionList = await redis.smembers(cacheSession1.usersSession);
      assert(sessionList.length > 0);
      assert(sessionList.includes(session.sessionId));

			assert(await redis.hget(cacheSession1.sessionIdLocation, "refresh-token") === cacheSession1.refreshTokenLocation)
			assert(await redis.hget(cacheSession1.sessionIdLocation, "access-token") === cacheSession1.accessTokenLocation)
			assert(await redis.hget(cacheSession1.sessionIdLocation, "user-id") === cacheSession1.user?.id)

      assert(
        await redis.hget(cacheSession1.accessTokenLocation, "session-id") ==
          session.sessionId,
      );
      assert(
        await redis.hget(cacheSession1.accessTokenLocation, "user-id") ==
          userTesting.id,
      );

      assert(
        await redis.hget(cacheSession1.refreshTokenLocation, "session-id") ==
          session.sessionId,
      );
      assert(
        await redis.hget(cacheSession1.refreshTokenLocation, "user-id") ==
          userTesting.id,
      );

      // test verify token
      const isTokenValid = await sessionService.verifyToken(
        session.accessToken.token,
      );
      assert(isTokenValid !== undefined, "Token is not valid");
      assert(
        isTokenValid.user.id === userTesting.id,
        "Verify token should return user data",
      );

      // do refresh token
      const sessionRefresh = await sessionService.refreshTokenSession(
        session.refreshToken.token,
      );
			if(!sessionRefresh) throw new Error("Session refresh is undefined");
			const cacheSession1New = new CacheLocation({
				user: userTesting,
				sessionId: sessionRefresh.sessionId,
				accessToken: sessionRefresh.accessToken.payload,
				refreshToken: sessionRefresh.refreshToken.payload,
			});

      assertExists(sessionRefresh, "Refresh token is not valid");

			assert(await redis.hget(cacheSession1New.sessionIdLocation, "refresh-token") === cacheSession1New.refreshTokenLocation)
			assert(await redis.hget(cacheSession1New.sessionIdLocation, "access-token") === cacheSession1New.accessTokenLocation)
			assert(await redis.hget(cacheSession1New.sessionIdLocation, "user-id") === cacheSession1New.user?.id)

      // old location should be invalid
      assert(
        (await redis.hgetall(cacheSession1.accessTokenLocation)).length === 0,
      );
			assert(
        (await redis.hgetall(cacheSession1.refreshTokenLocation)).length === 0,
      );

			// new location should be valid
			assert(
        (await redis.hgetall(cacheSession1New.accessTokenLocation)).length > 0,
      );
			assert(
        (await redis.hgetall(cacheSession1New.refreshTokenLocation)).length > 0,
      );

      // do logout
      await sessionService.logout(sessionRefresh.accessToken.token);
      assert(
        (await redis.hgetall(cacheSession1New.accessTokenLocation)).length === 0,
      );
      assert(
        (await redis.hgetall(cacheSession1New.refreshTokenLocation)).length === 0,
      );
      assert(
        (await redis.hgetall(cacheSession1New.sessionIdLocation)).length === 0,
      )
      assert(
        ((await redis.smembers(cacheSession1New.usersSession)).includes(cacheSession1New?.sessionId ?? "") === false)
      )

    });

    it("Should error when refresh token is not valid", async () => {
      try{
        const session = await sessionService.refreshTokenSession(
          "not-valid-token",
        );
        assert(session === undefined);
      }catch(e){
        assert(e instanceof Error);
      }
    })

    it("Should error when token is not valid", async () => {
      try{
        const session = await sessionService.verifyToken(
          "not-valid-token",
        );
        assert(session === undefined);
      }catch(e){
        assert(e instanceof Error);
      }
    })
  },
);
