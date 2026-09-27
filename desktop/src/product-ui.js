(() => {
  const api = window.piDesktop;
  const $ = (id) => document.getElementById(id);
  let fetching;
  async function refresh() {
    if (fetching) return fetching;
    fetching = api.distributionStatus().then(({ updates, components, dataDirectory, portable }) => {
      if (portable) $("productRemovalHint").textContent = "免安装版：退出后删除解压目录即可移除程序。个人技能、Key、会话和已下载资源保存在下方本地数据目录，移动程序或更换版本不会删除它们。";
      $("productVersion").textContent = `v${updates.version}`;
      $("productDataDirectory").textContent = dataDirectory;
      $("updateStatus").textContent = updates.message;
      $("componentsStatus").textContent = components.message + (components.status === "available" ? ` · 约 ${(components.bytes / 1024 ** 2).toFixed(1)} MB` : "");
      $("checkUpdates").disabled = ["disabled", "checking", "downloading", "ready"].includes(updates.status);
      $("downloadUpdate").classList.toggle("hidden", updates.status !== "available");
      $("installUpdate").classList.toggle("hidden", updates.status !== "ready");
      $("checkComponents").disabled = ["disabled", "checking", "downloading", "ready"].includes(components.status);
      $("installComponents").classList.toggle("hidden", !["available", "error"].includes(components.status));
      $("pauseComponents").classList.toggle("hidden", components.status !== "downloading");
      $("restartResources").classList.toggle("hidden", components.status !== "ready");
      $("resourceProgress").textContent = components.message;
      $("resourceProgress").classList.toggle("hidden", !["downloading", "ready", "error"].includes(components.status));
    }).catch(() => { $("updateStatus").textContent = "暂时无法读取更新状态，请重新打开设置。"; }).finally(() => { fetching = null; });
    return fetching;
  }
  for (const [id, action] of Object.entries({ checkUpdates: api.checkUpdates, downloadUpdate: api.downloadUpdate, installUpdate: api.installUpdate, checkComponents: api.checkComponents, installComponents: api.installComponents, pauseComponents: api.pauseComponents, restartResources: api.restart })) {
    $(id).addEventListener("click", async () => {
      $(id).disabled = true;
      try { await action(); }
      catch (error) { $(id.toLowerCase().includes("update") ? "updateStatus" : "componentsStatus").textContent = error.message; return; }
      finally { $(id).disabled = false; }
      await refresh();
    });
  }
  api.onDistributionChanged(() => { void refresh(); });
  void refresh();
})();
