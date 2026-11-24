-- KeyRelay：Lemon Squeezy License API と同じ形で使えるライセンスキーのサーバー
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,              -- URL に入る名前（例: acme）
  name TEXT NOT NULL,
  admin_token_hash TEXT NOT NULL,   -- 管理 API 用トークンの SHA-256
  stripe_webhook_secret TEXT,       -- 販売者自身の Stripe Webhook の署名シークレット
  default_activation_limit INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS license_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',   -- inactive / active / expired / disabled
  activation_limit INTEGER,                  -- NULL = 無制限
  expires_at TEXT,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',     -- manual / lemonsqueezy / stripe
  source_ref TEXT,                           -- 元の ID や Stripe の Checkout Session ID
  meta TEXT NOT NULL DEFAULT '{}',           -- store_id, order_id, product_name, customer_email など
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_keys_ref ON license_keys (tenant_id, source_ref);
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,                       -- UUID
  key_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inst_key ON instances (key_id);
CREATE TABLE IF NOT EXISTS usage_daily (
  tenant_id TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
CREATE TABLE IF NOT EXISTS signups (
  ip_hash TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
