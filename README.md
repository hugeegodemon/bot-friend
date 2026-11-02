# Discord AI Companion

一個會自然參與群聊的 Discord AI 群友。文字聊天由 DeepSeek 驅動；設定 Gemini API Key 後，還能分析群友上傳的 LOL 精彩或搞笑影片，再用角色口吻加入討論。

## 現有功能

- 被 `@` 或回覆時一定回答
- 純文字叫「吉伊堡」也視為直接對話，不要求一定使用 Discord mention
- 同一頻道的連續訊息會先短暫合併，避免逐句搶答
- 與同一位群友的對話會在短時間內自然延續，不必每句都重新 `@`
- 群聊累積到隨機訊息門檻後才評估自然插話，模型也可以判斷保持沉默
- 每個頻道獨立的短期上下文，不會把不同群組的對話混在一起
- 可編輯的「吉伊堡」人格卡：自信、開朗、反應俐落，敢吐槽但不刻薄
- Discord 影片附件 → Gemini 影片理解 → DeepSeek 人格化回覆
- 頻道白名單、冷卻時間、影片大小、記憶長度與插話機率都可設定
- SQLite 保存每個伺服器的頻道與自然插話設定
- `/companion` 管理指令、今日 API 呼叫計數與伺服器資料刪除
- 常見 GitHub、Discord、Google 與 API Token 自動遮蔽，不會送進模型上下文
- 避免回覆時再次 ping 使用者，長訊息會安全分段

目前是可自架的 MVP。記憶保存在行程記憶體中，重啟後會清除；訂閱、管理後台、長期記憶與多租戶計費尚未加入。

## 1. 建立 Discord Bot

1. 到 [Discord Developer Portal](https://discord.com/developers/applications) 建立 Application。
2. 在 **Bot** 頁建立 Bot，取得 Token。
3. 在 **Privileged Gateway Intents** 開啟 **Message Content Intent**。這個 Bot 要讀取一般群聊內容，因此需要它。
4. 在 **OAuth2 → URL Generator** 勾選 `bot`，權限至少需要：
   - View Channels
   - Send Messages
   - Read Message History
5. 用產生的 URL 把 Bot 邀進伺服器。

請勿把 Discord Token 或任何 API Key 貼到聊天、commit 或公開 repository。

## 2. 安裝與設定

需求：Node.js 24 或更新版本。

```powershell
npm install
Copy-Item .env.example .env
```

編輯 `.env`，至少填入：

```dotenv
DISCORD_TOKEN=你的 Discord Bot Token
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

若要分析影片，再填：

```dotenv
GEMINI_API_KEY=你的 Gemini API Key
```

預設人格卡位於 `personas/jiibao.md`。修改 Markdown 後重啟 Bot 即可生效，也能透過 `PERSONA_FILE` 指向另一份人格卡。

建議先把 `ALLOWED_CHANNEL_IDS` 設成一個測試頻道的 ID；多個頻道用逗號分隔。Discord 開發者模式開啟後，可以右鍵頻道複製 ID。

如果希望新加入的伺服器必須由管理員手動啟用頻道，可設定：

```dotenv
REQUIRE_CHANNEL_OPT_IN=true
```

## 3. 執行

開發模式：

```powershell
npm run dev
```

正式執行：

```powershell
npm run build
npm start
```

檢查程式：

```powershell
npm test
npm run typecheck
```

Bot 第一次登入後會註冊全域 `/companion` 指令。Discord 的全域指令可能需要一段時間才會顯示；開發時若不想重複註冊，可以設定 `REGISTER_COMMANDS=false`。

## 管理指令

- `/companion status`：目前頻道狀態、插話設定、影片功能及今日用量。
- `/companion channel enabled:true|false`：啟用或停用目前頻道。
- `/companion autopilot`：調整是否自然插話、候選機率與冷卻秒數。
- `/companion forget`：清除目前頻道的短期記憶。
- `/companion delete-data confirm:true`：刪除該伺服器的設定與用量資料。

除了 `status` 之外，管理操作需要 Discord 的「管理伺服器」權限。資料庫預設位於 `data/bot.sqlite`，不會被 Git 追蹤。

## 參與群聊的邏輯

Bot 不會對每句話都回覆：

1. 被 `@`、被回覆或直接叫「吉伊堡」：一定進入回覆流程，並短暫等待連續訊息收齊。
2. 有影片且已設定 Gemini：分析後回覆。
3. 吉伊堡回覆後，同一位群友在延續時間內可以直接接話，不必再次 `@`。
4. 一般聊天：每個頻道累積到隨機訊息門檻且冷卻結束後，才詢問 DeepSeek 是否值得插話。
5. DeepSeek 若判斷不適合，會回傳內部的 `<NO_REPLY>`；這不會啟動冷卻時間。

可從 `.env` 調整：

- `AUTO_REPLY_PROBABILITY`：達到訊息門檻後交給模型評估的機率；預設 `1`，實際是否發話仍由模型決定。
- `AUTO_REPLY_COOLDOWN_SECONDS`：自然插話的頻道冷卻。
- `MIN_MESSAGES_BEFORE_AUTO_REPLY` / `MAX_MESSAGES_BEFORE_AUTO_REPLY`：兩次自然插話檢查之間，隨機累積幾則人類訊息。
- `MESSAGE_BATCH_WINDOW_MS`：直接互動時等待其他連續訊息的時間。
- `FOLLOW_UP_WINDOW_SECONDS`：吉伊堡回覆後，同一位群友可直接延續對話的時間。
- `AMBIENT_REPLY_DELAY_MIN_MS` / `AMBIENT_REPLY_DELAY_MAX_MS`：自然插話判斷觸發後的隨機等待時間。
- `BOT_WAKE_WORDS`：逗號分隔的稱呼；訊息包含任一稱呼時一定進入回覆流程。
- `MEMORY_MESSAGES` / `MEMORY_TTL_MINUTES`：每個頻道的短期記憶。

## 隱私與上線前注意事項

- 一般訊息內容會傳送給 DeepSeek；影片附件會傳送給 Google Gemini。請在伺服器內清楚揭露資料流向。
- 若要做成公開訂閱 Bot，需要補上隱私政策、服務條款、資料刪除機制、每個伺服器的同意與設定，以及用量／費用上限。
- Message Content 是 Discord 的特權 Intent。當 App 擴大到 Discord 規定的審查門檻時，需要申請審核。
- Gemini 對影片通常以抽幀方式理解；LOL 的快速操作可能漏掉細節，因此人格提示詞要求它在看不清時坦白說明。

## 下一階段建議

1. PostgreSQL：把目前的 SQLite 儲存層升級成多執行個體共用資料庫。
2. `/companion persona` 與每個伺服器的自訂人格。
3. 每個伺服器的預算、速率限制與方案配額。
4. 網頁管理台與 Discord OAuth2。
5. Stripe 或 Discord Premium Apps 訂閱。
6. 可選的向量記憶，只保存群組明確允許的摘要。
