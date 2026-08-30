import { describe, expect, it } from "vitest";
import { CHAT_ATTACHMENT_MAX_BYTES } from "@sparstrow/shared";
import { createChatAttachmentUploader } from "./attachment-uploader";

/**
 * T-CS5-02. `checkChatAttachmentFile` itself is covered in
 * `packages/shared/src/chat-attachment.test.ts` — these tests are about
 * this file's own wiring: reject before any network call, build the right
 * storage key, and never call `getPublicUrl` (this task's own Trap).
 */

function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as unknown as File;
}

function fakeSupabase(opts: { uploadError?: { message: string } | null }) {
  const uploadCalls: Array<{ path: string; options: unknown }> = [];
  const getPublicUrlCalls: string[] = [];
  return {
    supabase: {
      storage: {
        from: () => ({
          upload: (path: string, _body: unknown, options: unknown) => {
            uploadCalls.push({ path, options });
            return Promise.resolve({ error: opts.uploadError ?? null });
          },
          getPublicUrl: (path: string) => {
            getPublicUrlCalls.push(path);
            return { data: { publicUrl: "should never be called" } };
          },
        }),
      },
    } as never,
    uploadCalls,
    getPublicUrlCalls,
  };
}

describe("createChatAttachmentUploader", () => {
  it("rejects an oversized file before calling storage.upload at all", async () => {
    const { supabase, uploadCalls } = fakeSupabase({});
    const uploader = createChatAttachmentUploader(supabase);
    const file = fakeFile("big.txt", "text/plain", CHAT_ATTACHMENT_MAX_BYTES + 1);
    await expect(uploader.upload(file, "ws_1/chs_1")).rejects.toThrow(/2 MB or smaller/);
    expect(uploadCalls).toHaveLength(0);
  });

  it("rejects a disallowed type before calling storage.upload at all", async () => {
    const { supabase, uploadCalls } = fakeSupabase({});
    const uploader = createChatAttachmentUploader(supabase);
    const file = fakeFile("archive.zip", "application/zip", 100);
    await expect(uploader.upload(file, "ws_1/chs_1")).rejects.toThrow(/images, PDF/);
    expect(uploadCalls).toHaveLength(0);
  });

  it("uploads a valid file under <prefix>/<uuid>.<ext> and returns the storage path, not a URL", async () => {
    const { supabase, uploadCalls, getPublicUrlCalls } = fakeSupabase({});
    const uploader = createChatAttachmentUploader(supabase);
    const file = fakeFile("notes.txt", "text/plain", 100);
    const result = await uploader.upload(file, "ws_1/chs_1");

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].path).toMatch(
      /^ws_1\/chs_1\/[0-9a-f-]{36}\.txt$/,
    );
    expect(result).toEqual({
      storagePath: uploadCalls[0].path,
      filename: "notes.txt", // the ORIGINAL name, not the uuid-based key
      mimeType: "text/plain",
      sizeBytes: 100,
    });
    // This task's own Trap: never a public URL, permanent or otherwise.
    expect(getPublicUrlCalls).toHaveLength(0);
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("publicUrl");
  });

  it("propagates a storage upload error as a thrown Error", async () => {
    const { supabase } = fakeSupabase({ uploadError: { message: "network blip" } });
    const uploader = createChatAttachmentUploader(supabase);
    const file = fakeFile("notes.txt", "text/plain", 100);
    await expect(uploader.upload(file, "ws_1/chs_1")).rejects.toThrow("network blip");
  });
});
