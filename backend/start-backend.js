const { fork } = require("child_process");
const crypto = require("crypto");
const path = require("path");

// Shared only by the two servers started here, so internal routes cannot be called from outside.
process.env.INTERNAL_SERVICE_TOKEN =
  String(process.env.INTERNAL_SERVICE_TOKEN || "").trim() || crypto.randomBytes(32).toString("hex");

const services = [
  { name: "user-server", file: "server.js" },
  { name: "admin-server", file: "admin-server.js" },
];

const children = services.map((service) => {
  const child = fork(path.join(__dirname, service.file), [], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[backend] ${service.name} exited with ${reason}`);
  });
  return child;
});

const shutdownAll = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

process.on("SIGINT", shutdownAll);
process.on("SIGTERM", shutdownAll);
