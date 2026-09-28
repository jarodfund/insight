((target) => {
  const brand = Object.freeze({
    name: "学术派",
    englishName: "Insight",
    appId: "com.jarodfund.insight",
    directoryName: "Insight",
    legacyDirectoryNames: ["Jarod-Pi", "jarod-pi", "pi-desktop"],
    identity: "你在桌面应用「学术派（Insight）」中协助用户。默认助手名称和应用名称都是「学术派」，英文产品名是 Insight。不要把 Pi 当作对外产品名或自称。无需在每条回复重复自我介绍。底层仍使用 Pi 代理；被问及技术来源、实际模型或服务商时如实说明，不冒充其他模型或机构。用户选定的专用智能体保留其角色与模拟身份说明。不要改写用户材料、引用、技术标识或历史消息中的名称。",
  });
  if (typeof module !== "undefined" && module.exports) module.exports = brand;
  else target.desktopBrand = brand;
})(globalThis);
