# ER Diagram

```mermaid
erDiagram
	USER {
		text id PK
		text name
		text email UK
		boolean email_verified
		text image
		timestamp created_at
		timestamp updated_at
	}

	SESSION {
		text id PK
		timestamp expires_at
		text token UK
		timestamp created_at
		timestamp updated_at
		text ip_address
		text user_agent
		text user_id FK
	}

	ACCOUNT {
		text id PK
		text account_id
		text provider_id
		text user_id FK
		text access_token
		text refresh_token
		text id_token
		timestamp access_token_expires_at
		timestamp refresh_token_expires_at
		text scope
		text password
		timestamp created_at
		timestamp updated_at
	}

	VERIFICATION {
		text id PK
		text identifier
		text value
		timestamp expires_at
		timestamp created_at
		timestamp updated_at
	}

	RECIPE_SOURCES {
		uuid id PK
		text user_id FK
		text source_url
		enum source_type
		text title
		text description
		text servings_text
		jsonb raw_content
		jsonb normalized_recipe
		timestamp fetched_at
		timestamp created_at
		timestamp updated_at
	}

	PLANS {
		uuid id PK
		text user_id FK
		text title
		enum status
		int requested_servings
		uuid active_version_id FK
		timestamp created_at
		timestamp updated_at
	}

	PLAN_RECIPE_SOURCES {
		uuid plan_id PK, FK
		uuid recipe_source_id PK, FK
		int sort_order
		timestamp created_at
		timestamp updated_at
	}

	PLAN_VERSIONS {
		uuid id PK
		uuid plan_id FK
		int version_number
		uuid parent_version_id FK
		enum change_reason
		text change_summary
		jsonb plan_json
		jsonb patch_from_parent
		text created_by_user_id FK
		timestamp created_at
	}

	COOKING_SESSIONS {
		uuid id PK
		uuid plan_id FK
		uuid plan_version_id FK
		text user_id FK
		enum status
		text current_step_id
		timestamp started_at
		timestamp completed_at
		timestamp created_at
		timestamp updated_at
	}

	SESSION_EVENTS {
		uuid id PK
		uuid session_id FK
		enum event_type
		text step_id
		jsonb payload
		timestamp occurred_at
		timestamp created_at
	}

	SESSION_TIMERS {
		uuid id PK
		uuid session_id FK
		text plan_timer_id
		text step_id
		text label
		int duration_seconds
		int paused_remaining_seconds
		enum status
		timestamp started_at
		timestamp ends_at
		timestamp created_at
		timestamp updated_at
	}

	USER ||--o{ SESSION : has
	USER ||--o{ ACCOUNT : has
	USER ||--o{ RECIPE_SOURCES : owns
	USER ||--o{ PLANS : owns
	USER ||--o{ PLAN_VERSIONS : creates
	USER ||--o{ COOKING_SESSIONS : runs

	PLANS ||--o{ PLAN_RECIPE_SOURCES : links
	RECIPE_SOURCES ||--o{ PLAN_RECIPE_SOURCES : links
	PLANS ||--o{ PLAN_VERSIONS : versions
	PLAN_VERSIONS ||--o{ PLAN_VERSIONS : parent_of
	PLANS o|--|| PLAN_VERSIONS : active_version

	PLANS ||--o{ COOKING_SESSIONS : sessions
	PLAN_VERSIONS ||--o{ COOKING_SESSIONS : used_by
	COOKING_SESSIONS ||--o{ SESSION_EVENTS : records
	COOKING_SESSIONS ||--o{ SESSION_TIMERS : tracks
```

Note: `SESSION_TIMERS` does not persist a per-second countdown. While a timer is `running`, the client computes the remaining time from `ends_at`; `paused_remaining_seconds` is stored only for paused or manually adjusted timers. `plan_timer_id` links each session timer back to the timer definition embedded in the plan document.
