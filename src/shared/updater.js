export const UPDATE_REPO = "GOBUT/yiyu-web-translator";
export const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

export function parseVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkForUpdates({ currentVersion, fetchImpl = fetch } = {}) {
  const current = String(currentVersion || "0.0.0");
  const response = await fetchImpl(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub Releases 请求失败（HTTP ${response.status}）`);
  }
  const release = await response.json();
  const latest = String(release.tag_name || release.name || "").replace(/^v/i, "");
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const chromium = assets.find((asset) => /chromium.*\.zip$/i.test(asset.name || ""));
  const firefox = assets.find((asset) => /firefox.*\.zip$/i.test(asset.name || ""));
  return {
    currentVersion: current,
    latestVersion: latest,
    hasUpdate: Boolean(latest) && compareVersions(latest, current) > 0,
    releaseUrl: release.html_url || RELEASES_PAGE,
    releaseName: release.name || release.tag_name || "",
    publishedAt: release.published_at || "",
    chromiumUrl: chromium?.browser_download_url || "",
    firefoxUrl: firefox?.browser_download_url || "",
  };
}
