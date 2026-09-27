const fs = require("node:fs");
const path = require("node:path");

class Credentials {
  constructor(file, encryption, environmentKey = "") {
    this.file = file;
    this.managedFile = `${file}.managed`;
    this.encryption = encryption;
    this.environmentKey = environmentKey.trim();
    this.environmentDisabled = fs.existsSync(this.managedFile);
    this.savedKey = "";
    this.sessionKey = "";
    this.unreadable = false;
    if (fs.existsSync(file)) {
      try {
        this.savedKey = encryption.decryptString(fs.readFileSync(file));
      } catch {
        this.unreadable = true;
      }
    }
  }

  get key() {
    // An unreadable saved credential must not silently select another account.
    return this.unreadable ? "" : this.savedKey || this.sessionKey || (this.environmentDisabled ? "" : this.environmentKey);
  }

  get source() {
    return this.unreadable ? "unreadable" : this.savedKey ? "saved" : this.sessionKey ? "session" : this.key ? "environment" : "missing";
  }

  save(value, remember = true) {
    if (!remember) {
      this.clear();
      this.sessionKey = value;
      return;
    }
    if (!this.encryption.isEncryptionAvailable() || this.encryption.getSelectedStorageBackend?.() === "basic_text") throw new Error("系统安全密钥存储暂不可用，请启用系统钥匙串，或取消“记住 Key”仅在本次使用。");
    const encrypted = this.encryption.encryptString(value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, encrypted, { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.savedKey = value;
    this.sessionKey = "";
    this.unreadable = false;
  }

  clear() {
    // A non-secret marker prevents re-importing the machine's old account after logout.
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.managedFile, "environment-import-disabled\n", { mode: 0o600 });
    fs.rmSync(this.file, { force: true });
    fs.rmSync(`${this.file}.tmp`, { force: true });
    this.environmentDisabled = true;
    this.savedKey = "";
    this.sessionKey = "";
    this.unreadable = false;
  }
}

module.exports = { Credentials };
