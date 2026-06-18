import { Buffer } from "node:buffer";
import { connect, type Socket } from "node:net";
import type { APIRoute } from "astro";

export const prerender = false;

const STREAM_HOST = "15.235.64.49";
const STREAM_PORT = 8366;
const STREAM_PATH = "/;";

function createRadioStream() {
  let socket: Socket | undefined;
  let headerBuffer = Buffer.alloc(0);
  let headersParsed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const radioSocket = connect({ host: STREAM_HOST, port: STREAM_PORT }, () => {
        radioSocket.write(
          [
            `GET ${STREAM_PATH} HTTP/1.0`,
            `Host: ${STREAM_HOST}`,
            "User-Agent: GenteComunicaciones/1.0",
            "Accept: audio/aac,audio/aacp,audio/*;q=0.9,*/*;q=0.8",
            "Icy-MetaData: 0",
            "Connection: close",
            "",
            "",
          ].join("\r\n")
        );
      });
      socket = radioSocket;

      radioSocket.setTimeout(15000, () => {
        controller.error(new Error("Radio stream connection timeout"));
        radioSocket.destroy();
      });

      radioSocket.on("data", (chunk) => {
        if (headersParsed) {
          controller.enqueue(chunk);
          return;
        }

        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const headerEnd = headerBuffer.indexOf("\r\n\r\n");

        if (headerEnd === -1) {
          return;
        }

        headersParsed = true;
        const firstLine = headerBuffer.subarray(0, headerEnd).toString("utf8").split("\r\n")[0];

        if (!firstLine.startsWith("ICY 200") && !firstLine.startsWith("HTTP/1.")) {
          controller.error(new Error("Unexpected radio stream response"));
          radioSocket.destroy();
          return;
        }

        const body = headerBuffer.subarray(headerEnd + 4);
        if (body.length > 0) {
          controller.enqueue(body);
        }
      });

      radioSocket.on("end", () => controller.close());
      radioSocket.on("error", (error) => controller.error(error));
    },
    cancel() {
      socket?.destroy();
    },
  });
}

export const GET: APIRoute = () => {
  return new Response(createRadioStream(), {
    headers: {
      "Content-Type": "audio/aac",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Accept-Ranges": "none",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
