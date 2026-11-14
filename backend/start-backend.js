const { fork } = require("child_process");
const path = require("path");

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
