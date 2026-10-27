export function appUrl() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL must be configured.");
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error("APP_URL must contain only the application origin.");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("APP_URL requires HTTPS except on localhost.");
  return url;
}
