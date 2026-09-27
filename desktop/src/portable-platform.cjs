const TARGETS = {
  "win32-x64": { id: "windows-x64", label: "Windows-x64", node: "node/node.exe", python: "python/python.exe", creatorPython: "creator-python/python.exe", orx: "bin/orx.exe", tools: ["bin/ffmpeg.exe", "bin/ffprobe.exe"] },
  "linux-x64": { id: "linux-x64", label: "Linux-x64", node: "node/bin/node", python: "python/bin/python3", creatorPython: "creator-python/bin/python3", orx: "bin/orx", tools: ["bin/ffmpeg", "bin/ffprobe"] },
  "darwin-arm64": { id: "macos-arm64", label: "macOS-Apple-Silicon", node: "node/bin/node", python: "python/bin/python3", creatorPython: "creator-python/bin/python3", orx: "bin/orx", tools: ["bin/ffmpeg", "bin/ffprobe"] },
  "darwin-x64": { id: "macos-x64", label: "macOS-Intel", node: "node/bin/node", python: "python/bin/python3", creatorPython: "creator-python/bin/python3", orx: "bin/orx", tools: ["bin/ffmpeg", "bin/ffprobe"] },
};

function portablePlatform(platform = process.platform, arch = process.arch) {
  const target = TARGETS[`${platform}-${arch}`];
  if (!target) throw new Error(`此免安装包暂不支持 ${platform}/${arch}。`);
  return { ...target, platform, arch, manifest: `portable-${target.id}.json`, updateId: `${target.id}-portable` };
}

module.exports = { TARGETS, portablePlatform };
