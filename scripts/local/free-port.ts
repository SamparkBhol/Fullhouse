import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

const server = createServer();
server.listen(0, "127.0.0.1", () => {
  console.log((server.address() as AddressInfo).port);
  server.close();
});
