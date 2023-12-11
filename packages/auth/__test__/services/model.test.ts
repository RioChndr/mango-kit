import { sleep } from "https://deno.land/x/sleep@v1.2.1/sleep.ts";
import { createDbTemporary, DbTemporary } from "../../../utils/docker-test.ts";
import { Postgresjs } from "../../deps.ts";
import { AuthModel, UserModel } from "../../services/model.ts";
import {
	afterAll,
	assert,
	beforeAll,
	beforeEach,
	describe,
	it
} from "../deps-dev.ts";
import { migrationTableAuth } from "../migration-auth.ts";

describe("Auth model", {sanitizeOps: false, sanitizeResources: false}, () => {
  let db: DbTemporary;
  let sql: Postgresjs.Sql;
  let model: AuthModel;

  beforeAll(async () => {
    db = await createDbTemporary({
      imageName: "test_db_model_0128321",
      dbName: "test_db_model_0128321",
      dbPassword: "test_db_model_0128321",
    });
    await sleep(2);
    sql = Postgresjs(db.dbUri, { onnotice(notice) {} });
    model = new AuthModel(sql);
  });
  afterAll(async () => {
    await sql.end();
    await db.stopDb();
  });

  beforeEach(async () => {
    await migrationTableAuth(sql);
  });

  it("Should able create user", async () => {
    const res = await model.createUser({
      email: "testuser@email.com",
      avatar: "https://test.com/avatar.png",
      confirmed_at: new Date(),
      role: ["user"],
    });
    assert(res !== undefined, "Should return user");
    assert(res.email === "testuser@email.com", "Email should be the same");
    assert(res.confirmed_at !== undefined, "Confirmed at should be the same");
    assert(
      res.role !== undefined && res.role[0] === "user",
      "Role should be the same",
    );
    assert(
      res.avatar === "https://test.com/avatar.png",
      "Avatar should be the same",
    );
    assert(
      res.created_at && res.updated_at,
      "Created at and updated at should not null",
    );
  });

  it("Should return user data using email and id", async () => {
    const user1 = await model.createUser({
      email: "user1-test@email.com",
      avatar: "https://test.com/avatar.png",
      confirmed_at: new Date(),
      role: ["user"],
    });
    await model.createUser({
      email: "user2-test@email.com",
      avatar: "https://test.com/avatar.png",
      confirmed_at: new Date(),
      role: ["user"],
    });

    const res = await model.getUserUnique("email", "user1-test@email.com");
    assert(res !== undefined, "Should return user");
    assert(res.email === user1?.email, "Email should be the same");
    assert(res.id === user1?.id, "Id should be the same");

    const res2 = await model.getUserUnique("id", user1?.id || "");
    assert(res2 !== undefined, "Should return user");
    assert(res2.email === user1?.email, "Email should be the same");
    assert(res2.id === user1?.id, "Id should be the same");
  });

  it("Should return undefined if email or id not found", async () => {
    await model.createUser({
      email: "user1-test@email.com",
      avatar: "https://test.com/avatar.png",
      confirmed_at: new Date(),
      role: ["user"],
    });
    await model.createUser({
      email: "user2-test@email.com",
      avatar: "https://test.com/avatar.png",
      confirmed_at: new Date(),
      role: ["user"],
    });

    const res = await model.getUserUnique("email", "unknown-user@email.com");
    assert(res === undefined, "Should return user");

    const res2 = await model.getUserUnique(
      "id",
      "f3f4d3c2-4d5d-4c6e-9f3e-8c7a6b5a4d1e",
    );
    assert(res2 === undefined, "Should return user");
  });

  it("Should able to create user by provider if user not exist", async () => {
    try {
      const emailUser = "user-1@email.com";
      const res = await model.createUserWithProvider({
        userInfo: {
          email: emailUser,
        },
        provider: {
          id: "google-id-123",
          email: emailUser,
          identity_data: {
            email: emailUser,
            name: "user-1",
            picture: "123",
          },
          provider: "google",
          last_sign_in_at: new Date(),
        },
      });

			assert(
				res.user.id !== undefined && res.user.id !== null && res.provider.id === 'google-id-123',
				"Should return user and provider",
			)

      const userInserted = await sql<
        UserModel[]
      >`SELECT * from auth.users where email = ${emailUser}`;
			
      assert(
        userInserted[0]?.email === emailUser,
        "Email user should be " + emailUser,
      );
      assert(
        userInserted[0]?.fullname === "user-1",
        "Fullname should be transferred",
      );
      assert(userInserted[0]?.avatar === "123", "Avatar should be transferred");
      assert(userInserted?.length === 1, "Should be inserted");

      const providerInserted =
        await sql`SELECT * from auth.providers where id = ${"google-id-123"}`;
      assert(providerInserted?.length === 1, "Should be inserted");
      assert(
        providerInserted[0]?.email === emailUser,
        "Email should be the same",
      );
    } catch (e) {
      console.log(e);
    }
  });

	it("Should not create enw user with provider if user already exist", async () => {
    try {
      const emailUser = "user-1@email.com";
			const input = {
        userInfo: {
          email: emailUser,
        },
        provider: {
          id: "google-id-123",
          email: emailUser,
          identity_data: {
            email: emailUser,
            name: "user-1",
            picture: "123",
          },
          provider: "google",
          last_sign_in_at: new Date(),
        },
      };
      await model.createUserWithProvider(input);
      await model.createUserWithProvider(input);
      await model.createUserWithProvider(input);

      const userInserted = await sql<
        UserModel[]
      >`SELECT * from auth.users where email = ${emailUser}`;
      console.log(userInserted);
      assert(userInserted?.length === 1, "Should be inserted");

      const providerInserted =
        await sql`SELECT * from auth.providers where id = ${"google-id-123"}`;
      assert(providerInserted?.length === 1, "Should be inserted");
    } catch (e) {
      console.log(e);
    }
  });
});
