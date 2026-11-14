const bcrypt = require("bcryptjs");
const { pool, query } = require("./db-admin");

const MIN_PASSWORD_LENGTH = 12;

const readSecret = (prompt) =>
  new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Run this command in an interactive terminal so the password can be entered without echo."));
      return;
    }

    let value = "";
    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
    };
    const onData = (key) => {
      const character = String(key);
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Password reset cancelled."));
      } else if (character === "\r" || character === "\n") {
        cleanup();
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else if (character >= " ") {
        value += character;
      }
    };

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });

const isLoopbackHost = (host) => ["localhost", "127.0.0.1", "::1"].includes(String(host).toLowerCase());

const main = async () => {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Admin password reset is disabled when NODE_ENV=production.");
  }

  const host = process.env.ADMIN_PGHOST || process.env.PGHOST || "localhost";
  const database = process.env.ADMIN_PGDATABASE || "faithflow_admin";
  if (!isLoopbackHost(host) && process.env.ADMIN_RESET_ALLOW_REMOTE !== "true") {
    throw new Error("Refusing to reset a remote database. Set ADMIN_RESET_ALLOW_REMOTE=true only for an intentional non-production reset.");
  }

  process.stdout.write(`Resetting the fixed admin account in ${database} on ${host}.\n`);
  const confirmation = await readSecret("Type RESET to continue: ");
  if (confirmation !== "RESET") {
    throw new Error("Confirmation did not match; the password was not changed.");
  }

  const password = await readSecret("New password (hidden): ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const confirmationPassword = await readSecret("Confirm new password (hidden): ");
  if (password !== confirmationPassword) {
    throw new Error("Passwords do not match; the password was not changed.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `
      UPDATE admin
      SET password = $1
      WHERE "adminID" = 1
      RETURNING "adminID"
    `,
    [passwordHash],
  );
  if (result.rowCount !== 1) {
    throw new Error("The fixed admin account was not found; no password was changed.");
  }

  process.stdout.write("Admin password updated.\n");
};

main()
  .catch((error) => {
    console.error(error.message || "Unable to reset the admin password.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
