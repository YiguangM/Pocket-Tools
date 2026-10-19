/**
 * Hands bytes to the browser as a download. The data goes from memory to a
 * blob: URL to the user's disk; nothing is sent over the network.
 */
export function downloadFile(filename: string, data: Uint8Array | Blob, type = "application/octet-stream"): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers read the blob after click() returns, so release it later.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
