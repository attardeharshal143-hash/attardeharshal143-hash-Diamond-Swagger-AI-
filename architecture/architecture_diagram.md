# Diamond Swagger AI - Architecture Diagram

Based on the specifications provided and the project's `README.md`, here is the high-level architectural diagram showing the data flow, components, and the generative AI integration.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#333333', 'primaryBorderColor': '#1d4ed8', 'lineColor': '#475569', 'secondaryColor': '#f1f5f9', 'tertiaryColor': '#e2e8f0', 'clusterBkg': '#f8fafc', 'clusterBorder': '#cbd5e1', 'fontFamily': 'Inter, Roboto, sans-serif', 'fontSize': '16px'}}}%%
graph TD
    classDef default fill:#fff,stroke:#cbd5e1,stroke-width:2px,rx:12,ry:12;
    classDef browser fill:#f1f5f9,stroke:#0ea5e9,stroke-width:2px,rx:12,ry:12,color:#0f172a;
    classDef agent fill:#eff6ff,stroke:#3b82f6,stroke-width:3px,rx:12,ry:12,color:#1e3a8a,font-weight:bold;
    classDef external fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,rx:12,ry:12,color:#78350f;
    classDef storage fill:#f3e8ff,stroke:#8b5cf6,stroke-width:2px,rx:12,ry:12,color:#4c1d95;
    classDef io fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,rx:12,ry:12,color:#14532d;
    
    subgraph "Client-Side Application (Browser)"
        UI["💻 User Interface<br/>(HTML/CSS/JS)"]
        LocalStore[("💾 Local Storage")]
        Auth["🔒 Firebase Auth"]
        
        subgraph "User Inputs"
            APIKey["🔑 Gemini API Key (BYOK)"]
            RFP["📄 RFP Requirements & Context"]
        end
        
        subgraph "Sequential Multi-Agent Architecture"
            Agent1["🛡️ 1. Pre-Flight Agent<br/>(Initial Triage)"]
            Agent2["⚙️ 2. Technical Agent<br/>(Compliance Mapping)"]
            Agent3["📊 3. Financial Agent<br/>(Risk & Analytics)"]
            Agent4["✍️ 4. Drafting Agent<br/>(Proposal Generation)"]
        end
        
        subgraph "Outputs & Visualization"
            Dashboard["📈 Results Dashboard<br/>(UI / Chart.js)"]
            Export["📥 Document Export<br/>(.docx / .pdf)"]
        end
    end
    
    subgraph "External Services"
        GoogleGenAI["🧠 Google Gemini Pro API<br/>(generativelanguage.googleapis.com)"]
    end

    %% Flow of Authentication and Setup
    UI -->|"User Login"| Auth
    APIKey -->|"Saved Temporarily"| LocalStore
    
    %% Input Flow
    UI -->|"Provide Context"| RFP
    RFP -->|"Trigger Workflow"| Agent1
    
    %% Multi-Agent Pipeline
    Agent1 -->|"Process & Pass Data"| Agent2
    Agent2 -->|"Process & Pass Data"| Agent3
    Agent3 -->|"Process & Pass Data"| Agent4
    
    %% AI Integration Flow (Direct from Client via BYOK)
    LocalStore -.-|"Injects API Key"| GoogleGenAI
    Agent1 == "HTTPS JSON Request" ==> GoogleGenAI
    Agent2 == "HTTPS JSON Request" ==> GoogleGenAI
    Agent3 == "HTTPS JSON Request" ==> GoogleGenAI
    Agent4 == "HTTPS JSON Request" ==> GoogleGenAI
    
    GoogleGenAI -. "JSON Response" .-> Agent1
    GoogleGenAI -. "JSON Response" .-> Agent2
    GoogleGenAI -. "JSON Response" .-> Agent3
    GoogleGenAI -. "JSON Response" .-> Agent4
    
    %% Output Flow
    Agent4 -->|"Result Delivery"| Dashboard
    Dashboard -->|"Download Draft"| Export

    class UI,Auth,Dashboard,Export browser;
    class Agent1,Agent2,Agent3,Agent4 agent;
    class GoogleGenAI external;
    class LocalStore storage;
    class APIKey,RFP io;
```

## Architecture Summary

1. **Client-Side Centric Execution:** The architecture has zero backend storage or servers. Everything from UI manipulation to JSON parsing and routing happens within the application context in the user's browser.
2. **Bring Your Own Key (BYOK) Security:** To prevent centralized data breaches and mitigate billing attacks, users provide their own `Google Gemini API Key`. It gets securely saved in the native `Local Storage`.
3. **Sequential Multi-Agent Pipeline:** The core engine consists of four distinct AI agents acting in sequence (`Pre-Flight` -> `Technical` -> `Financial` -> `Drafting`). Each agent fulfills a unique domain constraint for maximum accuracy.
4. **Direct Generative AI Integration:** The client makes highly secure HTTPS REST calls directly bridging the browser and the Google Generative Language APIs without server-side proxy middle-men.
5. **Polished Visualization & Export:** The final structured data is passed back from the AI pipeline directly to the UI rendering chart analytics (`Chart.js`) and finalized exported documents (`docx.js`/`html2pdf.js`).
