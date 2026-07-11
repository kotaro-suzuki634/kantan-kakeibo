CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
  monthly_income INTEGER NOT NULL DEFAULT 120000 CHECK (monthly_income >= 0),
  payday INTEGER NOT NULL DEFAULT 25 CHECK (payday BETWEEN 1 AND 31),
  saving_target INTEGER NOT NULL DEFAULT 12000 CHECK (saving_target >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_costs (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), category VARCHAR(30) NOT NULL DEFAULT '固定費',
  billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 31), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_month DATE NOT NULL, end_month DATE, memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('expense','income')),
  amount INTEGER NOT NULL CHECK (amount > 0), title VARCHAR(160) NOT NULL, merchant VARCHAR(120),
  category VARCHAR(30) NOT NULL, food_necessity VARCHAR(30) NOT NULL DEFAULT '未判定',
  transaction_date DATE NOT NULL, original_text TEXT, classification_confidence VARCHAR(10) NOT NULL DEFAULT 'low',
  memo TEXT, is_fixed_cost BOOLEAN NOT NULL DEFAULT FALSE,
  fixed_cost_id INTEGER REFERENCES fixed_costs(id) ON DELETE SET NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('scheduled','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixed_cost_id, transaction_date)
);

CREATE TABLE IF NOT EXISTS budget_settings (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL, percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentage >= 0),
  fixed_amount INTEGER CHECK (fixed_amount >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS classification_rules (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword VARCHAR(120), merchant VARCHAR(120), category VARCHAR(30) NOT NULL,
  food_necessity VARCHAR(30) NOT NULL DEFAULT '未判定', priority INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (keyword IS NOT NULL OR merchant IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_rules_lookup ON classification_rules(user_id, merchant, keyword, priority DESC);

