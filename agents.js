// --- GLOBAL VARIABLES ---
        let g_apiKey = localStorage.getItem('titans_gemini_key') || '';
        let g_analysisData = null;
        let analysisCompleted = false;
        
        // Gmail API Configuration
        const GMAIL_CLIENT_ID = '797317635282-3frebe7rqm2suiu8ulflr1ksle1fd5pg.apps.googleusercontent.com';
        const GMAIL_API_KEY = ''; // API Key is optional for OAuth flow
        const GMAIL_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
        const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
        
        let gapi_loaded = false;
        let gsi_loaded = false;
        let gmail_authorized = false;
        let gmail_emails = [];

        // --- INITIALIZATION ---
        document.addEventListener('DOMContentLoaded', async function() {
            // FIRST: Initialize views - show only one page at a time
            handleUrlHash();
            
            document.getElementById('geminiKey').value = g_apiKey;
            document.getElementById('geminiKey2').value = g_apiKey;
            
            // Load saved pattern preference
            loadSavedPattern();
            
            const defaultContext = localStorage.getItem('titans_default_context');
            if (defaultContext) {
                document.getElementById('myProductContext').value = defaultContext;
                document.getElementById('defaultProductContext').value = defaultContext;
            }
            
            // Check for login parameters from Google login page
            const urlParams = new URLSearchParams(window.location.search);
            const loginType = urlParams.get('login_type');
            const userEmail = urlParams.get('user_email');
            
            if (loginType && userEmail) {
                handleLoginRedirect(loginType, userEmail);
            }
            
            // Auto-find working model if API key exists
            if (g_apiKey) {
                console.log('Auto-detecting working Gemini model...');
                const workingModel = await findWorkingModel();
                if (workingModel) {
                    showToast(`✅ Ready! Using ${workingModel.model} (${workingModel.version})`);
                } else {
                    showToast("⚠️ No working models found. Please check your API key.");
                }
            }
            
            // Initialize Gmail Token Client for OAuth
            initGmailTokenClient();
            
            // Check for existing email connection
            const connectedEmail = localStorage.getItem('connected_email');
            if (connectedEmail) {
                gmail_authorized = true;
                updateEmailConnectionStatus(connectedEmail);
                loadDemoEmails();
            }
            
            // Check if user needs to login
            checkLoginStatus();
            
            // Handle URL hash for direct page access
            handleUrlHash();
            
            // Listen for hash changes
            window.addEventListener('hashchange', handleUrlHash);
        });
        
        // Handle URL hash to open specific page
        function handleUrlHash() {
            const hash = window.location.hash.replace('#', '');
            console.log('handleUrlHash called, hash:', hash);
            
            // First, hide ALL views and remove active class
            document.querySelectorAll('.view-section').forEach(el => {
                el.classList.remove('active');
                el.style.display = 'none';
                el.style.visibility = 'hidden';
            });
            
            // Determine which view to show
            const viewToShow = (hash && ['input', 'inbox', 'results', 'settings', 'creators'].includes(hash)) ? hash : 'input';
            console.log('Showing view:', viewToShow);
            
            // Show the target view
            const targetView = document.getElementById(`view-${viewToShow}`);
            if (targetView) {
                targetView.style.display = 'block';
                targetView.style.visibility = 'visible';
                targetView.classList.add('active');
            }
            
            // Update nav item active state
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            const navItem = document.querySelector(`.nav-item[onclick*="'${viewToShow}'"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
        }

        // Handle login redirect from Google login page
        function handleLoginRedirect(loginType, userEmail) {
            console.log(`Login redirect: ${loginType} - ${userEmail}`);
            
            if (loginType === 'google') {
                showToast(`🎉 Welcome! Connected to Gmail: ${userEmail}`);
                showToast('📧 Loading your RFP emails...');
                
                // Set up Gmail connection
                gmail_authorized = true;
                updateEmailConnectionStatus(userEmail);
                
                // Try to load real emails or fallback to demo
                setTimeout(() => {
                    if (!GMAIL_CLIENT_ID || GMAIL_CLIENT_ID === 'your-gmail-client-id.googleusercontent.com') {
                        loadDemoEmails();
                        showToast('📋 Demo emails loaded (real Gmail API not configured)');
                    } else {
                        syncEmails();
                    }
                }, 1000);
                
            } else if (loginType === 'demo') {
                showToast(`🎭 Demo Mode Active: ${userEmail}`);
                showToast('📧 Loading sample RFP emails...');
                
                gmail_authorized = true;
                updateEmailConnectionStatus(userEmail);
                loadDemoEmails();
            }
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Check login status and redirect if needed
        function checkLoginStatus() {
            // Skip if we just came from login page (URL has login params)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('login_type') || urlParams.get('user_email')) {
                return; // Already handled by URL parameter processing
            }
            
            const googleUser = localStorage.getItem('google_user');
            const connectedEmail = localStorage.getItem('connected_email');
            
            if (!googleUser && !connectedEmail) {
                // No login detected - but don't force login, just show a tip
                setTimeout(() => {
                    showToast('💡 Tip: Sign in with Google for full features, or try Demo Mode!');
                }, 3000);
            } else if (googleUser) {
                const user = JSON.parse(googleUser);
                showToast(`👋 Welcome back, ${user.name || user.email}!`);
                
                // Update user info in UI
                updateUserInfo(user);
            }
        }

        // Update user info in the UI
        function updateUserInfo(user) {
            // Hide login nav item when user is logged in
            const loginNavItem = document.getElementById('login-nav-item');
            if (loginNavItem) {
                loginNavItem.style.display = 'none';
            }
            
            // Show logout nav item in sidebar
            const logoutNavItem = document.getElementById('logout-nav-item');
            if (logoutNavItem) {
                logoutNavItem.style.display = 'flex';
            }
            
            // Show mobile logout button
            const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
            if (mobileLogoutBtn) {
                mobileLogoutBtn.style.display = 'flex';
            }
            
            // Add user info to sidebar
            const sidebar = document.querySelector('.sidebar');
            const existingUserInfo = document.getElementById('user-info');
            
            if (!existingUserInfo) {
                const userInfoDiv = document.createElement('div');
                userInfoDiv.id = 'user-info';
                userInfoDiv.style.cssText = `
                    margin-top: auto;
                    padding: 1rem;
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                `;
                
                userInfoDiv.innerHTML = `
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary-theme); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">
                        ${user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${user.name || 'User'}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${user.email}
                            ${user.demo_mode ? ' (Demo)' : ''}
                        </div>
                    </div>
                    <button onclick="logoutUser()" style="background: none; border: none; color: var(--text-medium); cursor: pointer; padding: 4px;" title="Logout">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                `;
                
                sidebar.appendChild(userInfoDiv);
            }
            
            // Update top bar user profile
            const userNameDisplay = document.getElementById('user-name-display');
            const userAvatarDisplay = document.getElementById('user-avatar-display');
            
            if (userNameDisplay) {
                userNameDisplay.textContent = user.name || user.email.split('@')[0] || 'User';
            }
            
            if (userAvatarDisplay) {
                const initials = user.name 
                    ? user.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('').substring(0, 2)
                    : user.email.charAt(0).toUpperCase();
                userAvatarDisplay.innerHTML = `<span>${initials}</span>`;
            }
            
            // Store user name for greeting
            localStorage.setItem('user_name', user.name || user.email.split('@')[0] || 'User');
            
            // Update dashboard greeting
            updateDashboardGreeting();
        }

        // Toggle notifications panel
        function toggleNotificationPanel() {
            const panel = document.getElementById('notificationPanel');
            const userDropdown = document.getElementById('userDropdown');
            
            // Close user dropdown if open
            if (userDropdown) userDropdown.style.display = 'none';
            
            // Toggle notification panel
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
            } else {
                panel.style.display = 'none';
            }
        }
        
        // Clear all notifications
        function clearNotifications() {
            document.getElementById('notificationList').innerHTML = '<div style="padding: 40px 16px; text-align: center; color: var(--text-medium);"><i class="fas fa-bell-slash" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i><div>No notifications</div></div>';
            document.getElementById('notification-count').style.display = 'none';
            showToast('✓ Notifications cleared');
        }
        
        // Show all notifications
        function showAllNotifications() {
            document.getElementById('notificationPanel').style.display = 'none';
            showToast('📋 All notifications view coming soon');
        }
        
        // Close panels when clicking outside
        document.addEventListener('click', function(e) {
            const notifPanel = document.getElementById('notificationPanel');
            const notifBtn = document.querySelector('.notification-btn');
            if (notifPanel && !notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
                notifPanel.style.display = 'none';
            }
        });

        // Toggle user dropdown menu
        function toggleUserDropdown() {
            const dropdown = document.getElementById('userDropdown');
            const user = JSON.parse(localStorage.getItem('google_user') || 'null');
            
            if (!user) {
                openLoginPage();
                return;
            }
            
            // Update dropdown info
            document.getElementById('dropdown-user-name').textContent = user.name || 'User';
            document.getElementById('dropdown-user-email').textContent = user.email || '';
            
            // Toggle visibility
            if (dropdown.style.display === 'none') {
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('userDropdown');
            const profile = document.getElementById('user-profile-header');
            if (dropdown && !dropdown.contains(e.target) && !profile.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Show user menu (legacy)
        function showUserMenu() {
            toggleUserDropdown();
        }

        // Logout function
        function logoutUser() {
            // Direct logout without confirmation
            localStorage.removeItem('google_user');
            localStorage.removeItem('connected_email');
            
            showToast('👋 Logged out successfully');
            
            // Redirect to login page
            setTimeout(() => {
                window.location.href = 'google_login.html?logout=true';
            }, 1000);
        }

        // --- API KEY MANAGEMENT ---
        function saveKey() {
            const k = document.getElementById('geminiKey').value.trim();
            localStorage.setItem('titans_gemini_key', k);
            g_apiKey = k;
            document.getElementById('geminiKey2').value = k;
            showToast("API Key Saved Securely");
        }

        function saveKey2() {
            const k = document.getElementById('geminiKey2').value.trim();
            localStorage.setItem('titans_gemini_key', k);
            g_apiKey = k;
            document.getElementById('geminiKey').value = k;
            showToast("API Key Saved Securely");
        }

        function clearAPIKey() {
            localStorage.removeItem('titans_gemini_key');
            g_apiKey = '';
            document.getElementById('geminiKey').value = '';
            document.getElementById('geminiKey2').value = '';
            showToast("API Key Cleared");
        }

        function saveDefaultContext() {
            const context = document.getElementById('defaultProductContext').value;
            localStorage.setItem('titans_default_context', context);
            showToast("Default Context Saved");
        }

        // --- FIND WORKING MODEL ---
        async function findWorkingModel(explicitKey = null) {
            const key = explicitKey || document.getElementById('geminiKey').value.trim() || g_apiKey;
            if (!key) {
                console.log('No API key provided');
                return null;
            }
            
            // First validate API key format
            if (!key.startsWith('AIza')) {
                console.log('Invalid API key format - should start with AIza');
                showToast('❌ Invalid API key format. Should start with "AIza"');
                return null;
            }
            
            console.log('Testing Gemini API with key:', key.substring(0, 8) + '...');
            
            // First, try to list models to verify API key works
            try {
                console.log('Step 1: Testing basic API connection...');
                const listResponse = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {}, 2);
                
                if (!listResponse.ok) {
                    const errorText = await listResponse.text();
                    console.log('API key validation failed:', errorText);
                    showToast(`❌ API key invalid: ${listResponse.status} ${listResponse.statusText}`);
                    return null;
                }
                
                const listData = await listResponse.json();
                console.log('✅ API key valid. Available models:', listData.models?.length || 0);
                
                if (listData.models && listData.models.length > 0) {
                    // Find a model that supports generateContent
                    const generateModels = listData.models.filter(m => 
                        m.supportedGenerationMethods && 
                        m.supportedGenerationMethods.includes('generateContent')
                    );
                    
                    console.log('Models supporting generateContent:', generateModels.length);
                    
                    if (generateModels.length > 0) {
                        // Test the first available model
                        const testModel = generateModels[0];
                        const modelName = testModel.name.replace('models/', '');
                        
                        console.log(`Step 2: Testing generation with: ${modelName}`);
                        
                        const testResponse = await fetchWithRetry(
                            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: "Hello" }] }]
                                })
                            },
                            2
                        );
                        
                        if (testResponse.ok) {
                            const workingModel = { version: 'v1beta', model: modelName };
                            console.log(`✅ Working model confirmed: ${modelName}`);
                            localStorage.setItem('working_model', JSON.stringify(workingModel));
                            return workingModel;
                        } else {
                            console.log(`Generation test failed for ${modelName}:`, testResponse.status);
                            if (testResponse.status === 429) {
                                showToast('❌ Rate Limit: Project Quota Exceeded during generation');
                                return null;
                            } else if (testResponse.status === 403) {
                                showToast('❌ API Key lacks Gemini access or hits Regional lock (403)');
                                return null; 
                            } else if (testResponse.status === 400) {
                                showToast('❌ Invalid payload format: 400 Bad Request');
                                return null;
                            }
                        }
                    }
                }
            } catch (error) {
                console.log('API connection error:', error);
                showToast(`❌ Connection error: ${error.message}`);
                return null;
            }
            
            // Fallback: try common models manually
            console.log('Step 3: Trying common models as fallback...');
            const commonModels = [
                { version: 'v1beta', model: 'gemini-1.5-flash' },
                { version: 'v1', model: 'gemini-1.5-flash' },
                { version: 'v1beta', model: 'gemini-1.5-pro' },
                { version: 'v1beta', model: 'gemini-pro' }
            ];
            
            for (const { version, model } of commonModels) {
                try {
                    console.log(`Testing: ${version}/models/${model}`);
                    
                    const response = await fetchWithRetry(
                        `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: "Hello" }] }]
                            })
                        },
                        2
                    );
                    
                    if (response.ok) {
                        console.log(`✅ Working model found: ${model} (${version})`);
                        localStorage.setItem('working_model', JSON.stringify({ version, model }));
                        return { version, model };
                    } else {
                        console.log(`${model} (${version}) failed:`, response.status);
                        if (response.status === 429) {
                            showToast(`❌ Rate Limit: Quota Exceeded for ${model}`);
                            return null;
                        } else if (response.status === 403) {
                            showToast(`❌ Forbidden: Region Lock or API Tier on ${model}`);
                            return null;
                        }
                    }
                } catch (error) {
                    console.log(`${model} (${version}) error:`, error.message);
                }
            }
            
            console.log('❌ No working models found');
            return null;
        }

        // --- MANUAL MODEL FINDER ---
        async function manualFindModels() {
            const key = document.getElementById('geminiKey').value.trim();
            if (!key) {
                showToast("Please enter an API key first");
                return;
            }
            
            // Validate key format first
            if (!key.startsWith('AIza')) {
                showToast('❌ Invalid API key format. Should start with "AIza"');
                return;
            }
            
            if (key.length < 30) {
                showToast(`⚠️ API key seems too short. Expected 39+ chars, got ${key.length}`);
                return;
            }
            
            showToast("🔍 Searching for available models...");
            
            const workingModel = await findWorkingModel(key);
            if (workingModel) {
                showToast(`✅ Found working model: ${workingModel.model} (${workingModel.version})`);
            } else {
                showToast("❌ No working models found. Please check:");
                showToast("1. API key is correct and active");
                showToast("2. You have Gemini API access enabled");
                showToast("3. Try the debug tool for detailed analysis");
            }
        }

        // --- COMPREHENSIVE API VALIDATION ---
        async function validateAPIAccess(explicitKey = null) {
            const key = explicitKey || document.getElementById('geminiKey').value.trim() || g_apiKey;
            if (!key) return false;
            
            try {
                // Test basic API access with retry for 502/503
                const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {}, 2);
                
                if (response.status === 429) {
                    showToast("❌ Rate limit exceeded during validation");
                    showToast("⏳ Please wait a few minutes before testing");
                    return false;
                } else if (response.status === 403) {
                    showToast("❌ API key invalid or access denied");
                    return false;
                } else if (response.status === 404) {
                    showToast("❌ API endpoint not found - check your region");
                    return false;
                } else if (!response.ok) {
                    const errorText = await response.text();
                    showToast(`❌ API error: ${response.status} - ${errorText}`);
                    return false;
                }
                
                const data = await response.json();
                console.log('API validation successful:', data);
                
                // Check rate limit headers if available
                const remaining = response.headers.get('X-RateLimit-Remaining');
                const resetTime = response.headers.get('X-RateLimit-Reset');
                
                if (remaining !== null) {
                    console.log(`Rate limit remaining: ${remaining}`);
                    if (parseInt(remaining) < 5) {
                        showToast(`⚠️ Low rate limit remaining: ${remaining} requests`);
                    }
                }
                
                return true;
                
            } catch (error) {
                showToast(`❌ Network error: ${error.message}`);
                return false;
            }
        }

        // --- ADVANCED DASHBOARD FUNCTIONS ---
        let dashboardProjects = [];
        let trendsChart = null;

        function initDashboard() {
            updateDashboardGreeting();
            
            // Add demo projects if none exist
            const savedProjects = localStorage.getItem('rfp_projects');
            if (!savedProjects || JSON.parse(savedProjects).length === 0) {
                const demoProjects = [
                    {
                        id: 1,
                        client: 'TechCorp Inc.',
                        name: 'Cloud Infrastructure RFP',
                        status: 'in-progress',
                        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                        progress: 65,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: 2,
                        client: 'Global Finance Ltd.',
                        name: 'Security Audit RFP',
                        status: 'review',
                        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                        progress: 85,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: 3,
                        client: 'HealthCare Plus',
                        name: 'Data Migration RFP',
                        status: 'draft',
                        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
                        progress: 20,
                        createdAt: new Date().toISOString()
                    }
                ];
                localStorage.setItem('rfp_projects', JSON.stringify(demoProjects));
            }
            
            loadDashboardData();
            initTrendsChart();
            renderProjectsTable();
        }

        function updateDashboardGreeting() {
            const hour = new Date().getHours();
            let greeting = 'Good morning';
            if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
            else if (hour >= 17) greeting = 'Good evening';
            
            const userName = localStorage.getItem('user_name') || '';
            const greetingEl = document.getElementById('dashboard-greeting');
            if (greetingEl) {
                greetingEl.textContent = userName 
                    ? `${greeting}, ${userName.split(' ')[0]}! Here's what's happening with your RFPs.`
                    : `${greeting}, here's what's happening with your RFPs.`;
            }
        }

        function loadDashboardData() {
            // Load projects from localStorage
            const savedProjects = localStorage.getItem('rfp_projects');
            dashboardProjects = savedProjects ? JSON.parse(savedProjects) : [];
            
            // Calculate stats
            const active = dashboardProjects.filter(p => ['draft', 'in-progress', 'review'].includes(p.status)).length;
            const submitted = dashboardProjects.filter(p => ['submitted', 'won'].includes(p.status)).length;
            const overdue = dashboardProjects.filter(p => {
                if (!p.deadline) return false;
                const deadline = new Date(p.deadline);
                const today = new Date();
                const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
                return daysUntil <= 3 && daysUntil >= 0 && !['submitted', 'won', 'lost'].includes(p.status);
            }).length;
            
            const won = dashboardProjects.filter(p => p.status === 'won').length;
            const total = dashboardProjects.filter(p => ['submitted', 'won', 'lost'].includes(p.status)).length;
            const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

            // Update stat cards
            document.getElementById('stat-active').textContent = active;
            document.getElementById('stat-submitted').textContent = submitted;
            document.getElementById('stat-overdue').textContent = overdue;
            document.getElementById('stat-winrate').textContent = winRate + '%';

            // Update change indicators (mock data for now)
            updateStatChange('stat-active-change', '+12%', 'positive');
            updateStatChange('stat-submitted-change', '+8%', 'positive');
            updateStatChange('stat-overdue-change', overdue > 0 ? '+' + overdue : '0', overdue > 0 ? 'negative' : 'neutral');
            updateStatChange('stat-winrate-change', '+5%', 'positive');
        }

        function updateStatChange(elementId, value, type) {
            const el = document.getElementById(elementId);
            if (el) {
                el.textContent = value;
                el.className = 'stat-change ' + type;
            }
        }

        function initTrendsChart() {
            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            // Get monthly data from projects
            const monthlyData = getMonthlyProposalData();
            
            if (trendsChart) {
                trendsChart.destroy();
            }

            trendsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Proposals',
                        data: monthlyData.data,
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderRadius: 6,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 3 },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });

            // Update peak month
            const peakEl = document.getElementById('peak-month-value');
            if (peakEl) {
                peakEl.textContent = monthlyData.peakMonth;
            }
        }

        function getMonthlyProposalData() {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
            const data = [2, 4, 5, 3, 8, 12]; // Demo data
            
            // Find peak month
            const maxIndex = data.indexOf(Math.max(...data));
            const peakMonth = months[maxIndex] + ' (' + data[maxIndex] + ')';
            
            return { data, peakMonth };
        }

        function renderProjectsTable() {
            const tbody = document.getElementById('projects-table-body');
            const emptyState = document.getElementById('projects-empty-state');
            
            if (!tbody) return;

            // Filter active projects (not won/lost)
            const activeProjects = dashboardProjects.filter(p => 
                !['won', 'lost'].includes(p.status)
            ).slice(0, 5);

            if (activeProjects.length === 0) {
                tbody.innerHTML = '';
                if (emptyState) emptyState.style.display = 'block';
                return;
            }

            if (emptyState) emptyState.style.display = 'none';

            tbody.innerHTML = activeProjects.map(project => `
                <tr>
                    <td>
                        <div class="client-name">${project.client || 'Unknown Client'}</div>
                        <div class="project-name">${project.name || 'RFP Project'}</div>
                    </td>
                    <td>
                        <span class="status-badge ${project.status}">
                            ${getStatusIcon(project.status)} ${formatStatus(project.status)}
                        </span>
                    </td>
                    <td>${formatDeadline(project.deadline)}</td>
                    <td>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill ${getProgressClass(project.progress)}" style="width: ${project.progress || 0}%"></div>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        function getStatusIcon(status) {
            const icons = {
                'draft': '<i class="fas fa-edit"></i>',
                'in-progress': '<i class="fas fa-spinner"></i>',
                'review': '<i class="fas fa-eye"></i>',
                'submitted': '<i class="fas fa-paper-plane"></i>',
                'won': '<i class="fas fa-trophy"></i>',
                'lost': '<i class="fas fa-times"></i>'
            };
            return icons[status] || '<i class="fas fa-file"></i>';
        }

        function formatStatus(status) {
            const labels = {
                'draft': 'Draft',
                'in-progress': 'In Progress',
                'review': 'Review',
                'submitted': 'Submitted',
                'won': 'Won',
                'lost': 'Lost'
            };
            return labels[status] || status;
        }

        function formatDeadline(deadline) {
            if (!deadline) return '-';
            const date = new Date(deadline);
            const today = new Date();
            const daysUntil = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntil < 0) return '<span style="color: #ef4444;">Overdue</span>';
            if (daysUntil === 0) return '<span style="color: #f59e0b;">Today</span>';
            if (daysUntil <= 3) return `<span style="color: #f59e0b;">${daysUntil} days</span>`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        function getProgressClass(progress) {
            if (progress < 30) return 'low';
            if (progress < 70) return 'medium';
            return 'high';
        }

        function showNewProposalForm() {
            const form = document.getElementById('new-proposal-form');
            if (form) {
                form.style.display = 'block';
                form.scrollIntoView({ behavior: 'smooth' });
            }
        }

        function hideNewProposalForm() {
            const form = document.getElementById('new-proposal-form');
            if (form) {
                form.style.display = 'none';
            }
        }

        function addProject(project) {
            dashboardProjects.push({
                id: Date.now(),
                client: project.client || 'Unknown',
                name: project.name || 'RFP Project',
                status: project.status || 'draft',
                deadline: project.deadline || null,
                progress: project.progress || 0,
                createdAt: new Date().toISOString()
            });
            saveDashboardProjects();
            loadDashboardData();
            renderProjectsTable();
        }

        function saveDashboardProjects() {
            localStorage.setItem('rfp_projects', JSON.stringify(dashboardProjects));
        }

        // Initialize dashboard on page load
        document.addEventListener('DOMContentLoaded', function() {
            initDashboard();
        });

        // --- API CALL WITH RETRY FOR 502/503 ERRORS ---
        async function fetchWithRetry(url, options, maxRetries = 3) {
            let lastError;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await fetch(url, options);
                    
                    // Handle 502/503 errors with retry
                    if (response.status === 502 || response.status === 503) {
                        if (attempt === maxRetries) return response; // Pass the error back to the caller instead of crashing
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(`Server error ${response.status}, attempt ${attempt}/${maxRetries}. Waiting ${waitTime/1000}s...`);
                        showToast(`⏳ Server busy (${response.status}). Retrying in ${waitTime/1000}s... (${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    
                    // Handle 429 rate limit with retry
                    if (response.status === 429) {
                        if (attempt === maxRetries) return response; // Pass the 429 back to the caller to handle legitimately
                        const waitTime = Math.pow(2, attempt) * 2000;
                        console.log(`Rate limited, attempt ${attempt}/${maxRetries}. Waiting ${waitTime/1000}s...`);
                        showToast(`⏳ Rate limited. Waiting ${waitTime/1000}s... (${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    
                    return response;
                } catch (error) {
                    lastError = error;
                    if (attempt < maxRetries) {
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(`Network error, attempt ${attempt}/${maxRetries}. Waiting ${waitTime/1000}s...`);
                        showToast(`⏳ Connection error. Retrying in ${waitTime/1000}s... (${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }
            throw lastError || new Error('Connection error: Max retries exceeded');
        }

        // --- RATE LIMIT TRACKER ---
        function trackAPIUsage() {
            const today = new Date().toDateString();
            const usage = JSON.parse(localStorage.getItem('gemini_usage') || '{}');
            
            if (usage.date !== today) {
                // Reset daily counter
                usage.date = today;
                usage.requests = 0;
                usage.lastRequest = null;
            }
            
            usage.requests = (usage.requests || 0) + 1;
            usage.lastRequest = new Date().toISOString();
            
            localStorage.setItem('gemini_usage', JSON.stringify(usage));
            
            console.log(`Daily API usage: ${usage.requests}/1500`);
            
            if (usage.requests > 1400) {
                showToast(`⚠️ High daily usage: ${usage.requests}/1500 requests`);
            }
            
            return usage;
        }

        function checkRateLimit() {
            const usage = JSON.parse(localStorage.getItem('gemini_usage') || '{}');
            const now = new Date();
            
            if (usage.lastRequest) {
                const lastRequest = new Date(usage.lastRequest);
                const timeDiff = now - lastRequest;
                const secondsSinceLastRequest = timeDiff / 1000;
                
                // Gemini free tier: 15 requests per minute
                if (secondsSinceLastRequest < 4) { // 60/15 = 4 seconds between requests
                    const waitTime = Math.ceil(4 - secondsSinceLastRequest);
                    showToast(`⏳ Rate limiting: waiting ${waitTime} seconds...`);
                    return waitTime * 1000; // Return milliseconds to wait
                }
            }
            
            return 0; // No wait needed
        }

        function showUsageStats() {
            const usage = JSON.parse(localStorage.getItem('gemini_usage') || '{}');
            const today = new Date().toDateString();
            
            if (usage.date !== today) {
                showToast("📊 Daily Usage: 0/1500 requests (Fresh start!)");
            } else {
                const requests = usage.requests || 0;
                const percentage = Math.round((requests / 1500) * 100);
                
                showToast(`📊 Today's Usage: ${requests}/1500 requests (${percentage}%)`);
                
                if (requests > 1400) {
                    showToast("⚠️ Approaching daily limit!");
                } else if (requests > 1000) {
                    showToast("📈 High usage today");
                } else {
                    showToast("✅ Usage looks good");
                }
                
                if (usage.lastRequest) {
                    const lastTime = new Date(usage.lastRequest).toLocaleTimeString();
                    showToast(`🕒 Last request: ${lastTime}`);
                }
            }
            
            showToast("💡 Free tier limits:");
            showToast("• 15 requests per minute");
            showToast("• 1,500 requests per day");
        }

        // --- GMAIL API INTEGRATION ---
        
        // Initialize Gmail API
        async function initializeGmailAPI() {
            try {
                await new Promise((resolve) => {
                    gapi.load('client', resolve);
                });
                
                await gapi.client.init({
                    apiKey: GMAIL_API_KEY,
                    discoveryDocs: [GMAIL_DISCOVERY_DOC],
                });
                
                gapi_loaded = true;
                console.log('Gmail API initialized');
            } catch (error) {
                console.error('Gmail API initialization failed:', error);
                showToast('❌ Gmail API initialization failed');
            }
        }

        // Gmail OAuth Token Client
        let gmailTokenClient = null;
        
        // Initialize Gmail Token Client
        function initGmailTokenClient() {
            if (typeof google !== 'undefined' && google.accounts) {
                gmailTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GMAIL_CLIENT_ID,
                    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
                    callback: handleGmailAuthResponse
                });
            }
        }
        
        // Handle Gmail Auth Response
        async function handleGmailAuthResponse(response) {
            if (response.error) {
                console.error('Gmail auth error:', response);
                showToast('❌ Gmail authorization failed');
                loadDemoEmails();
                return;
            }
            
            gmail_authorized = true;
            showToast('✅ Gmail connected! Loading Gmail API...');
            
            try {
                // Load Gmail API client library
                await new Promise((resolve, reject) => {
                    gapi.load('client', async () => {
                        try {
                            await gapi.client.init({
                                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
                            });
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
                
                showToast('📧 Fetching your emails...');
                await fetchRealGmailEmails();
            } catch (error) {
                console.error('Failed to fetch emails:', error);
                showToast('⚠️ Could not fetch emails. Loading demo data.');
                loadDemoEmails();
            }
        }
        
        // Connect to Gmail
        async function connectEmail() {
            const existingUser = localStorage.getItem('google_user');
            
            if (existingUser) {
                const user = JSON.parse(existingUser);
                
                if (user.demo_mode) {
                    showToast('🎭 Demo Mode Active');
                    loadDemoEmails();
                    return;
                }
            }
            
            // Try real Gmail OAuth
            if (gmailTokenClient) {
                showToast('🔐 Requesting Gmail access...');
                gmailTokenClient.requestAccessToken();
            } else {
                // Fallback to demo mode
                showToast('⚠️ Gmail API not available. Loading demo emails.');
                loadDemoEmails();
            }
        }

        // Start demo mode without full login
        function startDemoMode() {
            showToast('🎭 Starting Demo Mode...');
            
            const demoUser = {
                email: 'demo@company.com',
                name: 'Demo User',
                demo_mode: true
            };
            
            localStorage.setItem('google_user', JSON.stringify(demoUser));
            localStorage.setItem('connected_email', demoUser.email);
            
            gmail_authorized = true;
            updateEmailConnectionStatus(demoUser.email);
            updateUserInfo(demoUser);
            
            showToast('📧 Loading sample RFP emails...');
            setTimeout(() => {
                loadDemoEmails();
                showToast('🎉 Demo inbox ready! Try analyzing the RFP emails.');
            }, 1000);
        }

        // Disconnect Gmail
        function disconnectEmail() {
            localStorage.removeItem('connected_email');
            gmail_authorized = false;
            gmail_emails = [];
            
            updateEmailConnectionStatus(null);
            document.getElementById('emailListCard').style.display = 'none';
            document.getElementById('inbox-badge').textContent = '0';
            
            showToast('📧 Gmail disconnected');
        }

        // Update connection status UI
        function updateEmailConnectionStatus(email) {
            const statusDiv = document.getElementById('emailStatus');
            const connectBtn = document.getElementById('connectEmailBtn');
            const syncBtn = document.getElementById('syncEmailBtn');
            const disconnectBtn = document.getElementById('disconnectEmailBtn');
            // Demo indicator removed
            
            if (email) {
                statusDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;">
                        <i class="fas fa-check-circle" style="color: var(--accent-green); font-size: 1.2rem;"></i>
                        <div>
                            <strong>Connected to: ${email}</strong>
                            <div style="font-size: 0.8rem; color: var(--text-medium);">
                                Gmail integration active • Auto-sync enabled
                            </div>
                        </div>
                    </div>
                    <div style="background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent-green);">
                        <strong>✅ Ready to sync RFP emails!</strong>
                        <p style="margin: 5px 0 0 0; font-size: 0.85rem;">
                            The system will automatically detect emails containing RFP keywords and make them available for analysis.
                        </p>
                    </div>
                `;
                
                connectBtn.style.display = 'none';
                syncBtn.style.display = 'inline-flex';
                disconnectBtn.style.display = 'inline-flex';
                document.getElementById('emailListCard').style.display = 'block';
                
                // Demo indicator removed - no longer needed
            } else {
                statusDiv.innerHTML = `
                    <p style="color: var(--text-medium);">
                        <i class="fas fa-info-circle"></i> 
                        Connect your Gmail account to automatically sync RFP emails into the system.
                    </p>
                    <div style="margin-top: 1rem;">
                        <p><strong>Features:</strong></p>
                        <ul style="margin-left: 20px; color: var(--text-medium);">
                            <li>Auto-detect RFP emails by keywords</li>
                            <li>Extract requirements automatically</li>
                            <li>One-click analysis from inbox</li>
                            <li>Secure OAuth authentication</li>
                        </ul>
                    </div>
                `;
                
                connectBtn.style.display = 'inline-flex';
                syncBtn.style.display = 'none';
                disconnectBtn.style.display = 'none';
                document.getElementById('emailListCard').style.display = 'none';
                
                // Demo indicator removed - no longer needed
            }
        }

        // Load demo emails (simulating Gmail API response)
        function loadDemoEmails() {
            gmail_emails = [
                {
                    id: '1',
                    subject: 'RFP: Diamond Swagger AI Platform Expansion 2024',
                    sender: 'tech-innovation@global-enterprise.com',
                    senderName: 'Global Enterprise Tech',
                    snippet: 'We are seeking a strategic partner to implement a decentralized AI orchestration layer across our global subsidiaries...',
                    date: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago
                    isUnread: true,
                    isRFP: true,
                    priority: 'high',
                    body: `Dear Diamond Swagger Team,

Global Enterprise is officially launching a Request for Proposal (RFP) for our Phase 2 AI Expansion.

Core Requirements:
- Multi-Agent Orchestration Layer
- Real-time JSON parsing & data validation
- Zero-latency API connectivity with 99.99% SLA
- Advanced Security: BYOK (Bring Your Own Key) architecture
- Context-aware RFP processing & automated bid generation
- Budget: $450,000 - $600,000

Submission Deadline: May 15, 2024
Technical Lead: Harshal Attarde

Looking forward to your innovative proposal.`
                },
                {
                    id: '2',
                    subject: 'Urgent: GenAI Implementation for FinTech Compliance',
                    sender: 'compliance@swift-bank.com',
                    senderName: 'Swift Bank Compliance',
                    snippet: 'Immediate requirement for an AI-driven compliance monitoring system that automatically analyzes financial regulations...',
                    date: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
                    isUnread: true,
                    isRFP: true,
                    priority: 'high',
                    body: `Hello,

Swift Bank requires an immediate GenAI solution for compliance mapping.

Requirements:
- Automated matching of new regulations to internal policies
- Precise technical matching (SKU/Policy level)
- Dynamic pricing model for scalable deployment
- SOC2 Type II Certification required
- Estimated Budget: $850,000

We are under strict timelines. Please provide a feasibility report within 48 hours.

Regards,
Compliance Dept.`
                },
                {
                    id: '3',
                    subject: 'RFP for Smart Logistics & Predictive Analytics',
                    sender: 'ops@logi-global.com',
                    senderName: 'LogiGlobal Operations',
                    snippet: 'Requesting proposals for an integrated predictive analytics platform for global supply chain optimization...',
                    date: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                    isUnread: false,
                    isRFP: true,
                    priority: 'medium',
                    body: `Team,

LogiGlobal is seeking a vendor for our Smart Logistics initiative.

Project Scope:
- Predictive maintenance for fleet of 500+ vehicles
- AI-driven route optimization
- Automated RFP processing for sub-contractors
- Dashboard for real-time win-probability analysis
- Budget: $320,000

Proposal submissions close end of next month.

Best,
Ops Team`
                },
                {
                    id: '4',
                    subject: 'Q2 Software Development - E-commerce Overhaul',
                    sender: 'hiring@shopwave.io',
                    senderName: 'ShopWave Engineering',
                    snippet: 'Seeking a development agency for our Q2 frontend redesign and migration to Next.js...',
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                    isUnread: false,
                    isRFP: false,
                    priority: 'low',
                    body: `Hi,

We are looking for a Next.js expert agency for a Q2 project.

Scope:
- Frontend redesign
- Migration from legacy React
- Performance optimization
- Budget: $120,000

This is a standard project request, not a full RFP.

Thanks,
ShopWave Engineering`
                }
            ];
            
            renderEmailList();
            updateInboxBadge();
        }

        // Sync emails (real Gmail API or demo mode)
        async function syncEmails() {
            const syncIcon = document.getElementById('sync-icon');
            syncIcon.classList.add('fa-spin');
            showToast('📧 Syncing emails...');
            
            try {
                if (!GMAIL_CLIENT_ID || GMAIL_CLIENT_ID === 'your-gmail-client-id.googleusercontent.com') {
                    // Demo mode - simulate API delay
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    renderEmailList();
                    showToast('✅ Demo email sync complete!');
                } else {
                    // Real Gmail API integration
                    await fetchRealGmailEmails();
                    showToast('✅ Real Gmail sync complete!');
                }
            } catch (error) {
                console.error('Email sync failed:', error);
                showToast('❌ Email sync failed: ' + error.message);
            } finally {
                syncIcon.classList.remove('fa-spin');
            }
        }

        // Fetch real emails from Gmail API
        async function fetchRealGmailEmails() {
            if (!gmail_authorized) {
                throw new Error('Gmail not authorized. Please connect Gmail first.');
            }
            
            // Ensure Gmail client is loaded
            if (!gapi.client.gmail) {
                await new Promise((resolve, reject) => {
                    gapi.load('client', async () => {
                        try {
                            await gapi.client.init({
                                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
                            });
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
            }
            
            try {
                // Search for emails with RFP-related keywords
                const rfpKeywords = 'RFP OR "request for proposal" OR "proposal request" OR "bid invitation" OR "tender"';
                
                const response = await gapi.client.gmail.users.messages.list({
                    userId: 'me',
                    q: rfpKeywords,
                    maxResults: 20
                });
                
                if (response.result.messages) {
                    gmail_emails = [];
                    
                    // Fetch details for each message
                    for (const message of response.result.messages.slice(0, 10)) { // Limit to 10 for performance
                        const details = await gapi.client.gmail.users.messages.get({
                            userId: 'me',
                            id: message.id
                        });
                        
                        const email = parseGmailMessage(details.result);
                        if (email) {
                            gmail_emails.push(email);
                        }
                    }
                    
                    renderEmailList();
                    updateInboxBadge();
                } else {
                    showToast('📭 No RFP emails found');
                }
                
            } catch (error) {
                console.error('Failed to fetch Gmail emails:', error);
                throw error;
            }
        }

        // Parse Gmail API message format
        function parseGmailMessage(message) {
            try {
                const headers = message.payload.headers;
                const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
                
                const subject = getHeader('Subject');
                const from = getHeader('From');
                const date = new Date(parseInt(message.internalDate));
                
                // Extract sender name and email
                const fromMatch = from.match(/^(.*?)\s*<(.+)>$/) || [null, from, from];
                const senderName = fromMatch[1]?.trim() || from;
                const senderEmail = fromMatch[2]?.trim() || from;
                
                // Get email body
                let body = '';
                if (message.payload.body.data) {
                    body = atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } else if (message.payload.parts) {
                    const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
                    if (textPart && textPart.body.data) {
                        body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                    }
                }
                
                // Detect if it's an RFP
                const rfpKeywords = ['rfp', 'request for proposal', 'proposal request', 'bid', 'tender', 'quotation'];
                const isRFP = rfpKeywords.some(keyword => 
                    subject.toLowerCase().includes(keyword) || 
                    body.toLowerCase().includes(keyword)
                );
                
                // Determine priority
                const highPriorityKeywords = ['urgent', 'asap', 'immediate', 'priority', 'deadline'];
                const priority = highPriorityKeywords.some(keyword => 
                    subject.toLowerCase().includes(keyword) || 
                    body.toLowerCase().includes(keyword)
                ) ? 'high' : 'medium';
                
                return {
                    id: message.id,
                    subject: subject,
                    sender: senderEmail,
                    senderName: senderName,
                    snippet: body.substring(0, 150) + '...',
                    date: date,
                    isUnread: message.labelIds?.includes('UNREAD') || false,
                    isRFP: isRFP,
                    priority: priority,
                    body: body
                };
                
            } catch (error) {
                console.error('Failed to parse Gmail message:', error);
                return null;
            }
        }

        // Track selected emails for comparison
        let inbox_selected_rfps = new Set();

        // Load demo emails and refresh the view
        function loadDemoEmailsAndRefresh() {
            loadDemoEmails();
            
            // Show the email list card
            document.getElementById('emailListCard').style.display = 'block';
            
            // Update connection status
            const connectedEmail = localStorage.getItem('connected_email') || 'demo@company.com';
            localStorage.setItem('connected_email', connectedEmail);
            gmail_authorized = true;
            
            // Update UI
            document.getElementById('connectEmailBtn').style.display = 'none';
            document.getElementById('syncEmailBtn').style.display = 'inline-flex';
            document.getElementById('disconnectEmailBtn').style.display = 'inline-flex';
            
            // Render the email list
            renderEmailList();
            updateInboxBadge();
            
            showToast('✅ Demo RFPs loaded! Select RFPs to compare.');
        }

        // Render email list
        function renderEmailList() {
            const emailList = document.getElementById('emailList');
            const filter = document.getElementById('emailFilter')?.value || 'all';
            
            let filteredEmails = gmail_emails;
            
            // Apply filters
            switch (filter) {
                case 'unread':
                    filteredEmails = gmail_emails.filter(email => email.isUnread);
                    break;
                case 'rfp':
                    filteredEmails = gmail_emails.filter(email => email.isRFP);
                    break;
                case 'today':
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    filteredEmails = gmail_emails.filter(email => email.date >= today);
                    break;
            }

            // Always show compare toolbar and update stats
            const rfpCount = gmail_emails.filter(e => e.isRFP).length;
            updateQuickCompareStats();
            
            if (filteredEmails.length === 0) {
                emailList.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-medium);">
                        <i class="fas fa-inbox fa-3x" style="margin-bottom: 1rem; opacity: 0.3;"></i>
                        <p>No emails found matching the current filter.</p>
                    </div>
                `;
                return;
            }
            
            emailList.innerHTML = filteredEmails.map(email => {
                const timeAgo = getTimeAgo(email.date);
                const senderInitials = email.senderName.split(' ').map(n => n[0]).join('').substring(0, 2);
                const isSelected = inbox_selected_rfps.has(email.id);
                const quickScore = email.isRFP ? calculateQuickScore(email) : null;
                
                return `
                    <div class="email-item ${email.isUnread ? 'unread' : ''} ${email.isRFP ? 'rfp-detected' : ''} ${isSelected ? 'selected-for-compare' : ''}" 
                         onclick="openEmail('${email.id}')"
                         id="email-item-${email.id}">
                        
                        ${email.isRFP ? `
                            <div class="compare-checkbox" onclick="event.stopPropagation(); toggleEmailForCompare('${email.id}')" 
                                 style="width: 24px; height: 24px; border: 2px solid ${isSelected ? 'var(--accent-green)' : 'var(--border-color)'}; 
                                        border-radius: 4px; display: flex; align-items: center; justify-content: center; 
                                        cursor: pointer; margin-right: 10px; flex-shrink: 0; transition: all 0.2s;
                                        background: ${isSelected ? 'var(--accent-green)' : 'transparent'};">
                                ${isSelected ? '<i class="fas fa-check" style="color: white; font-size: 0.8rem;"></i>' : ''}
                            </div>
                        ` : '<div style="width: 34px;"></div>'}
                        
                        <div class="email-avatar" style="background: ${email.isRFP ? 'var(--secondary-theme)' : 'var(--primary-theme)'};">
                            ${senderInitials}
                        </div>
                        <div class="email-content">
                            <div class="email-subject">
                                ${email.subject}
                                ${email.isRFP ? '<span class="rfp-badge">RFP</span>' : ''}
                                ${email.priority === 'high' ? '<span class="priority-badge">HIGH</span>' : ''}
                                ${quickScore ? `<span style="background: ${getScoreColorInbox(quickScore)}; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; margin-left: 5px;">${quickScore}/100</span>` : ''}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-medium); margin-bottom: 0.3rem;">
                                From: ${email.senderName} &lt;${email.sender}&gt;
                            </div>
                            <div class="email-snippet">${email.snippet}</div>
                        </div>
                        <div class="email-meta">
                            <div>${timeAgo}</div>
                            ${email.isUnread ? '<div style="color: var(--primary-theme); font-weight: 600;">●</div>' : ''}
                        </div>
                        <div class="email-actions" style="display: flex; flex-direction: column; gap: 5px;">
                            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); analyzeEmailRFP('${email.id}')" 
                                    ${!email.isRFP ? 'style="display:none;"' : ''}>
                                <i class="fas fa-bolt"></i> Analyze
                            </button>
                            ${email.isRFP ? `
                                <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); toggleEmailForCompare('${email.id}')" 
                                        style="font-size: 0.7rem; padding: 4px 8px;">
                                    <i class="fas fa-${isSelected ? 'minus' : 'plus'}"></i> ${isSelected ? 'Remove' : 'Compare'}
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Calculate quick score for email preview
        function calculateQuickScore(email) {
            const content = email.body.toLowerCase();
            let score = 50;
            
            if (content.includes('cloud')) score += 15;
            if (content.includes('ai') || content.includes('automation')) score += 15;
            if (content.includes('security') || content.includes('compliance')) score += 10;
            if (content.includes('24/7') || content.includes('support')) score += 10;
            if (email.priority === 'high') score += 5;
            
            // Budget bonus
            const budgetMatch = email.body.match(/\$[\d,]+/);
            if (budgetMatch) {
                const budget = parseInt(budgetMatch[0].replace(/[$,]/g, ''));
                if (budget > 200000) score += 15;
                else if (budget > 100000) score += 10;
            }
            
            return Math.min(100, Math.max(10, score));
        }

        // Get score color for inbox
        function getScoreColorInbox(score) {
            if (score >= 80) return '#10b981';
            if (score >= 60) return '#f59e0b';
            return '#ef4444';
        }

        // Toggle email selection for comparison
        function toggleEmailForCompare(emailId) {
            const email = gmail_emails.find(e => e.id === emailId);
            if (!email || !email.isRFP) return;
            
            if (inbox_selected_rfps.has(emailId)) {
                inbox_selected_rfps.delete(emailId);
            } else {
                inbox_selected_rfps.add(emailId);
            }
            
            updateCompareToolbar();
            renderEmailList();
        }

        // Select all RFPs in inbox
        function selectAllRFPsInbox() {
            gmail_emails.filter(e => e.isRFP).forEach(email => {
                inbox_selected_rfps.add(email.id);
            });
            updateCompareToolbar();
            renderEmailList();
            showToast(`✅ Selected ${inbox_selected_rfps.size} RFPs for comparison`);
        }

        // Clear inbox selection
        function clearInboxSelection() {
            inbox_selected_rfps.clear();
            updateCompareToolbar();
            renderEmailList();
            showToast('Selection cleared');
        }

        // Update compare toolbar
        function updateCompareToolbar() {
            const count = inbox_selected_rfps.size;
            document.getElementById('compareCount').textContent = `${count} RFP${count !== 1 ? 's' : ''} selected`;
            document.getElementById('compareNowBtn').disabled = count < 2;
            
            if (count >= 2) {
                document.getElementById('compareNowBtn').style.background = 'var(--accent-green)';
            } else {
                document.getElementById('compareNowBtn').style.background = '#9ca3af';
            }
        }

        // Update quick compare stats
        function updateQuickCompareStats() {
            const rfpEmails = gmail_emails.filter(e => e.isRFP);
            
            // Update even if empty (show zeros)
            if (rfpEmails.length === 0) {
                document.getElementById('qsRFPCount').textContent = '0';
                document.getElementById('qsAvgWinRate').textContent = '0%';
                document.getElementById('qsTotalValue').textContent = '$0';
                document.getElementById('qsTopScore').textContent = '0';
                return;
            }
            
            // Calculate stats
            let totalValue = 0;
            let totalScore = 0;
            let topScore = 0;
            
            rfpEmails.forEach(email => {
                const score = calculateQuickScore(email);
                totalScore += score;
                if (score > topScore) topScore = score;
                
                const budgetMatch = email.body.match(/\$[\d,]+/);
                if (budgetMatch) {
                    let budget = parseInt(budgetMatch[0].replace(/[$,]/g, ''));
                    if (email.body.toLowerCase().includes('million') || email.body.toLowerCase().includes('m')) {
                        budget *= 1000000;
                    } else if (email.body.toLowerCase().includes('k')) {
                        budget *= 1000;
                    }
                    totalValue += budget;
                }
            });
            
            const avgWinRate = Math.round(totalScore / rfpEmails.length);
            
            document.getElementById('qsRFPCount').textContent = rfpEmails.length;
            document.getElementById('qsAvgWinRate').textContent = avgWinRate + '%';
            document.getElementById('qsTotalValue').textContent = formatCurrencyShort(totalValue);
            document.getElementById('qsTopScore').textContent = topScore;
        }

        // Format currency short
        function formatCurrencyShort(value) {
            if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
            if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'K';
            return '$' + value.toLocaleString();
        }

        // Compare selected RFPs - Shows results in a modal
        function compareSelectedRFPs() {
            // Get RFP emails (either selected or all RFPs)
            let rfpsToCompare = [];
            
            if (inbox_selected_rfps.size >= 2) {
                rfpsToCompare = gmail_emails.filter(e => inbox_selected_rfps.has(e.id) && e.isRFP);
            } else {
                // If less than 2 selected, compare all RFPs
                rfpsToCompare = gmail_emails.filter(e => e.isRFP);
            }
            
            if (rfpsToCompare.length < 2) {
                showToast('❌ Need at least 2 RFPs to compare. Click "Load Demo RFPs" first!');
                return;
            }
            
            showToast(`🔄 Analyzing ${rfpsToCompare.length} RFPs...`);
            
            // Analyze each RFP
            const analyzedRFPs = rfpsToCompare.map(email => {
                const score = calculateQuickScore(email);
                const budget = extractBudgetFromEmail(email);
                const winRate = calculateWinRate(email);
                
                return {
                    id: email.id,
                    title: email.subject,
                    company: email.senderName,
                    score: score,
                    winRate: winRate,
                    budget: budget,
                    priority: email.priority,
                    date: email.date,
                    body: email.body
                };
            });
            
            // Sort by score (highest first)
            analyzedRFPs.sort((a, b) => b.score - a.score);
            
            // Show comparison results modal
            showComparisonResultsModal(analyzedRFPs);
        }

        // Extract budget from email
        function extractBudgetFromEmail(email) {
            const budgetMatch = email.body.match(/\$[\d,]+(?:\s*-\s*\$[\d,]+)?/);
            if (budgetMatch) {
                return budgetMatch[0];
            }
            return 'Not specified';
        }

        // Calculate win rate
        function calculateWinRate(email) {
            const content = email.body.toLowerCase();
            let rate = 50;
            
            if (content.includes('cloud')) rate += 15;
            if (content.includes('ai') || content.includes('automation')) rate += 15;
            if (content.includes('security')) rate += 10;
            if (content.includes('compliance')) rate += 10;
            if (content.includes('24/7') || content.includes('support')) rate += 10;
            if (content.includes('scalable')) rate += 10;
            if (email.priority === 'high') rate += 5;
            
            // Negative factors
            if (content.includes('lowest price')) rate -= 15;
            if (content.includes('urgent') || content.includes('immediate')) rate -= 5;
            
            return Math.min(95, Math.max(20, rate));
        }

        // Show comparison results in a modal
        function showComparisonResultsModal(analyzedRFPs) {
            const winner = analyzedRFPs[0];
            const totalValue = analyzedRFPs.reduce((sum, rfp) => {
                const match = rfp.budget.match(/[\d,]+/g);
                if (match) {
                    return sum + parseInt(match[match.length - 1].replace(/,/g, ''));
                }
                return sum;
            }, 0);
            
            const avgWinRate = Math.round(analyzedRFPs.reduce((sum, rfp) => sum + rfp.winRate, 0) / analyzedRFPs.length);
            
            const modal = document.createElement('div');
            modal.id = 'comparisonModal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 2000;
                display: flex; justify-content: center; align-items: center;
                backdrop-filter: blur(5px);
                animation: fadeIn 0.3s ease;
            `;
            
            modal.innerHTML = `
                <div style="background: var(--card-bg); width: 95%; max-width: 900px; max-height: 90vh; 
                           border-radius: 16px; overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.3); position: relative;">
                    
                    <!-- Close Button (Top Right) -->
                    <button onclick="document.getElementById('comparisonModal').remove()" 
                            style="position: absolute; top: 15px; right: 15px; z-index: 10; 
                                   background: rgba(255,255,255,0.2); border: none; color: white; 
                                   width: 40px; height: 40px; border-radius: 50%; cursor: pointer; 
                                   font-size: 1.5rem; display: flex; align-items: center; justify-content: center;
                                   transition: all 0.2s; backdrop-filter: blur(5px);"
                            onmouseover="this.style.background='rgba(255,255,255,0.4)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.2)'"
                            title="Close">
                        ×
                    </button>
                    
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #4285f4 0%, #34a853 100%); color: white; padding: 1rem 1.5rem; text-align: center;">
                        <h2 style="margin: 0 0 0.25rem 0; font-size: 1.3rem;">🏆 RFP Comparison Results</h2>
                        <p style="margin: 0; opacity: 0.9; font-size: 0.8rem;">AI-powered analysis of ${analyzedRFPs.length} RFP opportunities</p>
                        
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.6rem;">
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 800;">${analyzedRFPs.length}</div>
                                <div style="font-size: 0.7rem; opacity: 0.9;">RFPs Analyzed</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 800;">${winner.score}</div>
                                <div style="font-size: 0.7rem; opacity: 0.9;">Top Score</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 800;">${avgWinRate}%</div>
                                <div style="font-size: 0.7rem; opacity: 0.9;">Avg Win Rate</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 800;">$${(totalValue/1000).toFixed(0)}K</div>
                                <div style="font-size: 0.7rem; opacity: 0.9;">Total Value</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Winner Section -->
                    <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 0.75rem 1rem; margin: 0.5rem 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <span style="font-size: 1.4rem;">👑</span>
                            <div>
                                <div style="font-size: 0.7rem; color: #10b981; font-weight: 600;">RECOMMENDED - BEST OPPORTUNITY</div>
                                <div style="font-size: 1rem; font-weight: 700; color: var(--text-dark);">${winner.title}</div>
                                <div style="color: var(--text-medium); font-size: 0.8rem;">${winner.company}</div>
                            </div>
                            <div style="margin-left: auto; text-align: center;">
                                <div style="background: #10b981; color: white; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800;">${winner.score}</div>
                                <div style="font-size: 0.65rem; color: var(--text-medium); margin-top: 0.2rem;">Score</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
                            <div style="background: white; padding: 0.5rem; border-radius: 6px; text-align: center;">
                                <div style="font-size: 1rem; font-weight: 700; color: #10b981;">${winner.winRate}%</div>
                                <div style="font-size: 0.65rem; color: var(--text-medium);">Win Probability</div>
                            </div>
                            <div style="background: white; padding: 0.5rem; border-radius: 6px; text-align: center;">
                                <div style="font-size: 1rem; font-weight: 700; color: var(--text-dark);">${winner.budget}</div>
                                <div style="font-size: 0.65rem; color: var(--text-medium);">Budget Range</div>
                            </div>
                            <div style="background: white; padding: 0.5rem; border-radius: 6px; text-align: center;">
                                <div style="font-size: 1rem; font-weight: 700; color: ${winner.priority === 'high' ? '#f59e0b' : 'var(--text-dark)'};">${winner.priority.toUpperCase()}</div>
                                <div style="font-size: 0.65rem; color: var(--text-medium);">Priority</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- All RFPs Ranking -->
                    <div style="padding: 1rem; max-height: 400px; overflow-y: auto;">
                        <h3 style="margin: 0 0 1rem 0; color: var(--text-dark);"><i class="fas fa-list-ol"></i> Complete Ranking</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: var(--light-bg);">
                                    <th style="padding: 0.8rem; text-align: left; font-size: 0.85rem; color: var(--text-medium);">Rank</th>
                                    <th style="padding: 0.8rem; text-align: left; font-size: 0.85rem; color: var(--text-medium);">RFP Title</th>
                                    <th style="padding: 0.8rem; text-align: center; font-size: 0.85rem; color: var(--text-medium);">Score</th>
                                    <th style="padding: 0.8rem; text-align: center; font-size: 0.85rem; color: var(--text-medium);">Win Rate</th>
                                    <th style="padding: 0.8rem; text-align: right; font-size: 0.85rem; color: var(--text-medium);">Budget</th>
                                    <th style="padding: 0.8rem; text-align: center; font-size: 0.85rem; color: var(--text-medium);">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${analyzedRFPs.map((rfp, index) => `
                                    <tr style="border-bottom: 1px solid var(--border-color); ${index === 0 ? 'background: rgba(16, 185, 129, 0.05);' : ''}">
                                        <td style="padding: 0.8rem;">
                                            <span style="background: ${index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : index === 2 ? '#3b82f6' : 'var(--text-medium)'}; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
                                                ${index + 1}
                                            </span>
                                        </td>
                                        <td style="padding: 0.8rem;">
                                            <div style="font-weight: 600; color: var(--text-dark);">${rfp.title}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-medium);">${rfp.company}</div>
                                        </td>
                                        <td style="padding: 0.8rem; text-align: center;">
                                            <span style="background: ${rfp.score >= 80 ? '#10b981' : rfp.score >= 60 ? '#f59e0b' : '#ef4444'}; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.9rem;">${rfp.score}</span>
                                        </td>
                                        <td style="padding: 0.8rem; text-align: center; color: ${rfp.winRate >= 70 ? '#10b981' : '#f59e0b'}; font-weight: 600;">${rfp.winRate}%</td>
                                        <td style="padding: 0.8rem; text-align: right; color: var(--text-dark);">${rfp.budget}</td>
                                        <td style="padding: 0.8rem; text-align: center;">
                                            <button onclick="document.getElementById('comparisonModal').remove(); analyzeEmailRFP('${rfp.id}')" style="background: var(--primary-theme); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
                                                <i class="fas fa-bolt"></i> Analyze
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- AI Recommendation -->
                    <div style="background: var(--light-bg); padding: 1.5rem; border-top: 1px solid var(--border-color);">
                        <h3 style="margin: 0 0 1rem 0; color: var(--text-dark);"><i class="fas fa-robot"></i> AI Recommendation</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                            <div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #10b981;">
                                <div style="font-weight: 600; color: #10b981; margin-bottom: 0.5rem;">✓ Top Priority</div>
                                <div style="font-size: 0.9rem; color: var(--text-medium);">Focus on "${winner.title}" - highest score with ${winner.winRate}% win probability</div>
                            </div>
                            <div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #3b82f6;">
                                <div style="font-weight: 600; color: #3b82f6; margin-bottom: 0.5rem;">📊 Portfolio Strategy</div>
                                <div style="font-size: 0.9rem; color: var(--text-medium);">${analyzedRFPs.filter(r => r.winRate >= 70).length} high-probability opportunities identified</div>
                            </div>
                            <div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #f59e0b;">
                                <div style="font-weight: 600; color: #f59e0b; margin-bottom: 0.5rem;">⚡ Quick Wins</div>
                                <div style="font-size: 0.9rem; color: var(--text-medium);">Target RFPs with scores above 70 for best ROI on proposal effort</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <!-- Footer with Actions -->
                    <div style="padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); background: var(--card-bg); flex-wrap: wrap; gap: 1rem;">
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="document.getElementById('comparisonModal').remove()" style="background: var(--light-bg); color: var(--text-dark); border: 1px solid var(--border-color); padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-arrow-left"></i> Back to Inbox
                            </button>
                            <button onclick="exportComparisonResults(${JSON.stringify(analyzedRFPs).replace(/"/g, '&quot;')})" style="background: var(--light-bg); color: var(--text-dark); border: 1px solid var(--border-color); padding: 12px 24px; border-radius: 8px; cursor: pointer;">
                                <i class="fas fa-download"></i> Export
                            </button>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="document.getElementById('comparisonModal').remove(); analyzeEmailRFP('${winner.id}')" style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-rocket"></i> Analyze Winner
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            showToast('✅ Comparison complete! See the results above.');
        }

        // Export comparison results
        function exportComparisonResults(analyzedRFPs) {
            const report = {
                exportDate: new Date().toISOString(),
                totalRFPs: analyzedRFPs.length,
                winner: analyzedRFPs[0],
                rankings: analyzedRFPs.map((rfp, index) => ({
                    rank: index + 1,
                    title: rfp.title,
                    company: rfp.company,
                    score: rfp.score,
                    winRate: rfp.winRate,
                    budget: rfp.budget
                }))
            };
            
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rfp-comparison-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('📊 Report exported successfully!');
        }

        // Open email details
        function openEmail(emailId) {
            const email = gmail_emails.find(e => e.id === emailId);
            if (!email) return;
            
            // Mark as read
            email.isUnread = false;
            updateInboxBadge();
            renderEmailList();
            
            // Show email content in a modal or expand inline
            showEmailModal(email);
        }

        // Show email in modal
        function showEmailModal(email) {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 1000;
                display: flex; justify-content: center; align-items: center;
                backdrop-filter: blur(5px);
            `;
            
            modal.innerHTML = `
                <div style="background: var(--card-bg); width: 90%; max-width: 700px; max-height: 80%; 
                           border-radius: var(--radius); padding: 2rem; overflow-y: auto;
                           border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div>
                            <h2 style="margin-bottom: 0.5rem;">${email.subject}</h2>
                            <div style="font-size: 0.9rem; color: var(--text-medium);">
                                <strong>From:</strong> ${email.senderName} &lt;${email.sender}&gt;<br>
                                <strong>Date:</strong> ${email.date.toLocaleString()}
                                ${email.isRFP ? '<br><span class="rfp-badge" style="margin-top: 5px; display: inline-block;">RFP DETECTED</span>' : ''}
                            </div>
                        </div>
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                                style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-medium);">×</button>
                    </div>
                    
                    <div style="background: var(--light-bg); padding: 1.5rem; border-radius: 8px; 
                               white-space: pre-wrap; font-family: monospace; font-size: 0.9rem; 
                               border: 1px solid var(--border-color); margin-bottom: 1rem;">
${email.body}
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        ${email.isRFP ? `
                            <button class="btn btn-primary" onclick="analyzeEmailRFP('${email.id}'); this.parentElement.parentElement.parentElement.remove();">
                                <i class="fas fa-bolt"></i> Analyze with Gemini AI
                            </button>
                        ` : ''}
                        <button class="btn btn-outline" onclick="this.parentElement.parentElement.parentElement.remove();">
                            Close
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }

        // Analyze email RFP
        function analyzeEmailRFP(emailId) {
            const email = gmail_emails.find(e => e.id === emailId);
            if (!email) return;
            
            // Extract company name from email
            const companyName = email.sender.split('@')[1].split('.')[0];
            const formattedCompany = companyName.charAt(0).toUpperCase() + companyName.slice(1);
            
            // Fill the form with email data
            document.getElementById('clientName').value = formattedCompany;
            document.getElementById('rfpText').value = email.body;
            
            // Determine category from email content
            const content = email.body.toLowerCase();
            if (content.includes('cloud') || content.includes('infrastructure')) {
                document.getElementById('rfpCategory').value = 'Cloud Infrastructure';
            } else if (content.includes('software') || content.includes('development')) {
                document.getElementById('rfpCategory').value = 'Software Development';
            } else if (content.includes('security') || content.includes('cybersecurity')) {
                document.getElementById('rfpCategory').value = 'Cybersecurity';
            } else if (content.includes('marketing') || content.includes('campaign')) {
                document.getElementById('rfpCategory').value = 'Marketing';
            }
            
            // Switch to dashboard and start analysis
            switchView('input');
            showToast(`📧 Email loaded: ${email.subject}`);
            showToast('🚀 Ready for analysis! Click "Run Gemini Analysis" to proceed.');
        }

        // Filter emails
        function filterEmails() {
            renderEmailList();
        }

        // Mark all emails as read
        function markAllRead() {
            gmail_emails.forEach(email => email.isUnread = false);
            updateInboxBadge();
            renderEmailList();
            showToast('✅ All emails marked as read');
        }

        // Update inbox badge count
        function updateInboxBadge() {
            const unreadCount = gmail_emails.filter(email => email.isUnread).length;
            document.getElementById('inbox-badge').textContent = unreadCount;
        }

        // Get time ago string
        function getTimeAgo(date) {
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        }

        // --- API TESTING ---
        async function testAPIKey() {
            const key = document.getElementById('geminiKey').value.trim();
            if (!key) {
                showToast("Please enter an API key first");
                return;
            }
            
            const testBtn = document.querySelector('.api-input-group button:nth-child(3)');
            const originalText = testBtn.innerHTML;
            testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            testBtn.disabled = true;
            
            try {
                // Step 1: Validate API key format
                if (!key.startsWith('AIza')) {
                    showToast('❌ Invalid API key format. Should start with "AIza"');
                    return;
                }
                
                showToast("Step 1: Validating API key format... ✅");
                
                // Step 2: Test basic API access
                showToast("Step 2: Testing API access...");
                const isValid = await validateAPIAccess(key);
                if (!isValid) {
                    return;
                }
                
                showToast("Step 3: Finding working models...");
                
                // Step 3: Find working model
                const workingModel = await findWorkingModel(key);
                if (workingModel) {
                    showToast(`✅ SUCCESS! Working model: ${workingModel.model} (${workingModel.version})`);
                    
                    // Test actual generation with retry
                    showToast("Step 4: Testing text generation...");
                    const testResponse = await fetchWithRetry(
                        `https://generativelanguage.googleapis.com/${workingModel.version}/models/${workingModel.model}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: "Say 'Hello from Gemini!'" }] }]
                            })
                        },
                        3
                    );
                    
                    if (testResponse.ok) {
                        const testData = await testResponse.json();
                        const responseText = testData.candidates[0].content.parts[0].text;
                        showToast(`✅ FULL TEST COMPLETE! Response: "${responseText}"`);
                    } else {
                        showToast(`⚠️ Model found but generation test failed (${testResponse.status})`);
                        if (testResponse.status === 502 || testResponse.status === 503) {
                            showToast("🔄 Google servers are temporarily overloaded. Try again in a minute.");
                        }
                    }
                } else {
                    showToast("❌ No working models found. Possible issues:");
                    showToast("• API key doesn't have Gemini access");
                    showToast("• Regional restrictions");
                    showToast("• Quota exceeded");
                    showToast("• Google servers temporarily unavailable");
                    showToast("💡 Try the debug tool for detailed analysis");
                }
                
            } catch (error) {
                console.error('Test error:', error);
                showToast(`❌ Test failed: ${error.message}`);
                if (error.message.includes('502') || error.message.includes('503')) {
                    showToast("🔄 Google servers are temporarily overloaded. Try again later.");
                }
            } finally {
                testBtn.innerHTML = originalText;
                testBtn.disabled = false;
            }
        }

        // --- MAIN GEMINI ANALYSIS ---
        async function startGeminiAnalysis() {
            analysisCompleted = false;
            if (!g_apiKey) {
                showToast("⚠️ No API Key found. Loading Demo Mode...");
                loadDemoData();
                return;
            }

            const client = document.getElementById('clientName').value || "Client";
            const rfpText = document.getElementById('rfpText').value;
            const myProduct = document.getElementById('myProductContext').value || "General Services";
            const category = document.getElementById('rfpCategory').value || "General";

            if (!rfpText.trim()) {
                showToast("Please enter RFP text.");
                document.getElementById('rfpText').focus();
                return;
            }

            // UI Updates
            setAgentStatus('running');
            showAnalysisOverlay();
            showToast("Gemini AI: Analyzing RFP requirements...");

            const runBtn = document.getElementById('runWorkflowBtn');
            const originalText = runBtn.innerHTML;
            runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            runBtn.disabled = true;
            document.getElementById('proceed-container').style.pointerEvents = 'none';

            updateWorkflowStep(1);

            try {
                // Check rate limit before making request
                // Track this API usage for internal metrics
                trackAPIUsage();
                const prompt = `You are an expert RFP Analyst and Solutions Architect. Your task is to perform a highly detailed, granular analysis of the RFP and return ONLY a strictly valid JSON object.

CRITICAL JSON FORMATTING RULES:
1. Do NOT include any explanatory text, markdown formatting, or code blocks. Return ONLY the raw JSON object.
2. ALL string values MUST be on a single line. NEVER use raw line breaks inside string values. Use the exact literal string \\n for newlines (e.g., in the email_draft).
3. Any quotes inside strings must be escaped (e.g., \\").

REQUIRED JSON SCHEMA AND DETAILED INSTRUCTIONS:

{
    "win_probability": 85,
    "reasoning": "A highly detailed, 2-3 sentence strategic rationale on why we match or fall short.",
    "technical_analysis": [
        // MUST PROVIDE AT LEAST 5 TO 8 DETAILED ROWS HERE covering all aspects of the RFP.
        { 
          "requirement": "Specific deeply extracted requirement from RFP", 
          "our_match": "Detailed explanation of exactly how our product meets this", 
          "status": "Compliant" // Must be "Compliant", "Partial", or "Non-Compliant"
        }
    ],
    "pricing_estimation": {
        "market_value": "Highly specific market estimation (e.g., $150k - $200k based on industry benchmarks)",
        "suggested_bid": "Specific suggested bid amount and contract term strategy"
    },
    "email_draft": "Write a highly professional, detailed 4-paragraph executive proposal letter. Remember: NO RAW NEWLINES. Use \\n\\n for paragraphs."
}

Now analyze this RFP:

Client: ${client}
Industry: ${category}
RFP Requirements: ${rfpText.substring(0, 2000)}
Our Product/Service: ${myProduct}

Execute the detailed analysis now. Return ONLY the JSON object.`;

                console.log('Calling Gemini API...');
                
                // Get working model from test or use default
                let workingModel = { version: 'v1beta', model: 'gemini-1.5-flash' };
                try {
                    const stored = localStorage.getItem('working_model');
                    if (stored) {
                        workingModel = JSON.parse(stored);
                    }
                } catch (e) {
                    console.log('Using default model');
                }
                
                console.log(`Using model: ${workingModel.model} (${workingModel.version})`);
                
                // Use fetchWithRetry for automatic 502/503/429 handling
                const response = await fetchWithRetry(
                    `https://generativelanguage.googleapis.com/${workingModel.version}/models/${workingModel.model}:generateContent?key=${g_apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: prompt
                                }]
                            }],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 8192,
                                responseMimeType: "application/json",
                                responseSchema: {
                                    type: "OBJECT",
                                    properties: {
                                        win_probability: { type: "INTEGER" },
                                        reasoning: { type: "STRING" },
                                        technical_analysis: {
                                            type: "ARRAY",
                                            items: {
                                                type: "OBJECT",
                                                properties: {
                                                    requirement: { type: "STRING" },
                                                    our_match: { type: "STRING" },
                                                    status: { type: "STRING" }
                                                }
                                            }
                                        },
                                        pricing_estimation: {
                                            type: "OBJECT",
                                            properties: {
                                                market_value: { type: "STRING" },
                                                suggested_bid: { type: "STRING" }
                                            }
                                        },
                                        email_draft: { type: "STRING" }
                                    },
                                    required: ["win_probability", "reasoning", "technical_analysis", "pricing_estimation", "email_draft"]
                                }
                            }
                        })
                    },
                    3 // Max 3 retries
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Gemini API Error:', errorText);
                    
                    // If 404, try to find a working model
                    if (response.status === 404) {
                        showToast("Model not found, trying alternative models...");
                        const altModel = await findWorkingModel();
                        if (altModel) {
                            // Retry with working model using fetchWithRetry
                            const retryResponse = await fetchWithRetry(
                                `https://generativelanguage.googleapis.com/${altModel.version}/models/${altModel.model}:generateContent?key=${g_apiKey}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{ parts: [{ text: prompt }] }],
                                        generationConfig: {
                                            temperature: 0.2, 
                                            maxOutputTokens: 8192, 
                                            responseMimeType: "application/json",
                                            responseSchema: {
                                                type: "OBJECT",
                                                properties: {
                                                    win_probability: { type: "INTEGER" },
                                                    reasoning: { type: "STRING" },
                                                    technical_analysis: {
                                                        type: "ARRAY",
                                                        items: {
                                                            type: "OBJECT",
                                                            properties: {
                                                                requirement: { type: "STRING" },
                                                                our_match: { type: "STRING" },
                                                                status: { type: "STRING" }
                                                            }
                                                        }
                                                    },
                                                    pricing_estimation: {
                                                        type: "OBJECT",
                                                        properties: {
                                                            market_value: { type: "STRING" },
                                                            suggested_bid: { type: "STRING" }
                                                        }
                                                    },
                                                    email_draft: { type: "STRING" }
                                                },
                                                required: ["win_probability", "reasoning", "technical_analysis", "pricing_estimation", "email_draft"]
                                            }
                                        }
                                    })
                                },
                                3
                            );
                            
                            if (retryResponse.ok) {
                                const retryData = await retryResponse.json();
                                let retryContent = retryData.candidates[0].content.parts[0].text;
                                
                                g_analysisData = await parseAIResponse(retryContent);
                                
                                if (g_analysisData) {
                                    updateWorkflowStep(2);
                                    setAgentStatus('done');
                                    showToast("✅ Analysis Complete with alternative model!");
                                    
                                    updateWorkflowStep(3);
                                    updateWorkflowStep(4);
                                    renderResults();
                                    showToast("🎉 Results ready!");
                                    return;
                                } else {
                                    console.log('Retry parsing also failed');
                                }
                            }
                        }
                    }
                    
                    // Handle 502/503 that still failed after retries
                    if (response.status === 502 || response.status === 503) {
                        throw new Error(`Server temporarily unavailable (${response.status}). Google's servers are overloaded. Please try again in a few minutes.`);
                    }
                    
                    throw new Error(`API Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log('Gemini Response:', data);

                if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                    throw new Error('Invalid API response format');
                }

                let content = data.candidates[0].content.parts[0].text;
                console.log('Raw AI response:', content);

                // Advanced JSON extraction and parsing
                g_analysisData = await parseAIResponse(content);
                
                if (g_analysisData) {
                    console.log("Successfully parsed analysis:", g_analysisData);
                    
                    // Success workflow
                    analysisCompleted = true;
                    updateWorkflowStep(2);
                    setAgentStatus('done');
                    showToast("✅ Analysis Complete!");

                    // Add project to dashboard
                    const clientName = document.getElementById('clientName').value || 'Unknown Client';
                    const rfpCategory = document.getElementById('rfpCategory').value || 'General';
                    addProject({
                        client: clientName,
                        name: rfpCategory + ' RFP',
                        status: 'in-progress',
                        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                        progress: 50
                    });

                    updateWorkflowStep(3);
                    updateWorkflowStep(4);
                    renderResults();
                    showToast("🎉 Results ready! Check the Results tab.");
                } else {
                    throw new Error('Failed to extract valid JSON from AI response');
                }

            } catch (err) {
                analysisCompleted = true;
                console.error("Analysis Error:", err);
                setAgentStatus('idle');
                
                // Handle specific error types with helpful messages
                if (err.message.includes('502') || err.message.includes('503') || err.message.includes('temporarily unavailable')) {
                    showToast("❌ Google Servers Temporarily Unavailable");
                    showToast("� FThis is a temporary issue on Google's end");
                    showToast("💡 Solutions:");
                    showToast("1. Wait 1-2 minutes and try again");
                    showToast("2. Check Google Cloud Status page");
                    showToast("3. Try a different time of day");
                    showToast("🎭 Loading Demo Mode...");
                    loadDemoData();
                } else if (err.message.includes('429') || err.message.includes('Rate limit')) {
                    showToast("❌ Rate Limit Exceeded");
                    showToast("📊 Free Tier Limits:");
                    showToast("• 15 requests per minute");
                    showToast("• 1,500 requests per day");
                    showToast("💡 Solutions:");
                    showToast("1. Wait a few minutes and try again");
                    showToast("2. Use Demo Mode to see how it works");
                    showToast("3. Upgrade to paid tier for higher limits");
                    showToast("🎭 Loading Demo Mode...");
                    loadDemoData();
                } else if (err.message.includes('403') || err.message.includes('access denied')) {
                    showToast("❌ API Access Denied");
                    showToast("💡 Possible issues:");
                    showToast("1. Invalid API key");
                    showToast("2. Gemini API not enabled");
                    showToast("3. Regional restrictions");
                    showToast("🔗 Get a new key: https://aistudio.google.com/app/apikey");
                } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                    showToast("❌ Network Connection Error");
                    showToast("💡 Check your internet connection");
                    showToast("🎭 Loading Demo Mode...");
                    loadDemoData();
                } else {
                    showToast(`❌ ${err.message}`);
                    showToast("🎭 Loading Demo Mode...");
                    loadDemoData();
                }
            } finally {
                runBtn.innerHTML = originalText;
                runBtn.disabled = false;
                hideAnalysisOverlay();
            }
        }

        // --- ADVANCED JSON PARSING ---
        async function parseAIResponse(content) {
            console.log('Attempting to parse AI response...');
            let parsedObj = null;

            // STRATEGY 1: Exact Block Sanitization Engine
            try {
                // Find boundaries to ignore Gemini's conversational text prefixes
                let firstBrace = content.indexOf('{');
                let lastBrace = content.lastIndexOf('}');
                
                if (firstBrace !== -1 && lastBrace !== -1) {
                    let jsonBlock = content.substring(firstBrace, lastBrace + 1);
                    
                    // Safely rescue literal newlines (Enter key presses) into escaped string formatting
                    // while ignoring newlines outside of quotes (so JSON structure stays valid)
                    let inString = false;
                    let sanitized = '';
                    for (let i = 0; i < jsonBlock.length; i++) {
                        const c = jsonBlock[i];
                        if (c === '"') {
                            // Only toggle if not escaped
                            let isEscaped = false;
                            let j = i - 1;
                            while (j >= 0 && jsonBlock[j] === '\\') {
                                isEscaped = !isEscaped;
                                j--;
                            }
                            if (!isEscaped) inString = !inString;
                            sanitized += c;
                        } else if (c === '\n' && inString) { // ONLY escape newlines inside strings
                            sanitized += '\\n';
                        } else if (c === '\r' && inString) {
                            sanitized += ''; // Ignore \r
                        } else if (c === '\t' && inString) {
                            sanitized += '\\t';
                        } else if (c < ' ' && inString) {
                            sanitized += ''; // Remove other control chars inside strings
                        } else {
                            if (!inString && (c === '\n' || c === '\r' || c === '\t')) {
                                sanitized += ' '; // Collapse outer white-space safely
                            } else {
                                sanitized += c;
                            }
                        }
                    }
                    
                    parsedObj = JSON.parse(sanitized);
                    
                    if (validateAnalysisData(parsedObj)) {
                        console.log('✅ Extraction & Parse successful');
                        return parsedObj;
                    }
                }
            } catch (e) {
                console.log('Parsing extraction failed: ', e.message);
                
                // STRATEGY 2: Absolute Code Flattening (Loose JS Evaluation)
                try {
                    console.log('Attempting Loose JS Evaluation...');
                    // Use eval to allow Javascript-relaxed keys (no quotes) and trailing commas
                    let block = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
                    // Force a completely flat string, replacing inner newlines with a generic space if necessary 
                    // This physically guarantees no multiline structural errors at the cost of paragraph visuals
                    let flat = block.replace(/[\n\r]+/g, ' '); 
                    parsedObj = (new Function("return " + flat))();
                    
                    if (validateAnalysisData(parsedObj)) {
                        console.log('✅ Loose JS successful');
                        return parsedObj;
                    }
                } catch(err2) {
                    console.log('Loose Extraction failed: ', err2.message);
                }
            }

            // STRATEGY 3: Ultimate Brute-Force Key Extraction
            // Complete fallback to manual Regex targeting when all formatting fails
            try {
                console.log('Attempting Strategy 3: Brute-Force Extraction');
                const text = content.replace(/[\u0000-\u001F]+/g, " "); // Flatten purely for soft regex
                
                const winM = text.match(/win_probability["']?\s*[:=]\s*(\d+)/i);
                const winProb = winM ? parseInt(winM[1], 10) : 80;

                const extractString = (key) => {
                    const rx = new RegExp(`(?:${key})["']?\\s*[:=]\\s*["']([^"\\\\]*(?:\\\\.[^"\\\\]*)*)["']`, 'i');
                    let match = text.match(rx);
                    if (!match) {
                        // Truncated fallback: grab everything until the end of the string if it lacks a closing quote
                        const rxTruncated = new RegExp(`(?:${key})["']?\\s*[:=]\\s*["'](.*)`, 'i');
                        match = text.match(rxTruncated);
                    }
                    if (match) {
                        return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                    }
                    return '';
                };

                const reasoning = extractString('reasoning') || "Strong alignment with core requirements.";
                const emailDraft = extractString('email_draft') || "Dear Client,\n\nWe provide an excellent fit for your needs and would love to proceed.";
                const marketVal = extractString('market_value') || "Based on industry benchmarks";
                const sugBid = extractString('suggested_bid') || "Competitive market pricing";

                let technical_analysis = [];
                const arrMatch = text.match(/technical_analysis["']?\s*[:=]\s*\[(.*?)\]/i);
                if (arrMatch) {
                    const block = arrMatch[1];
                    const rows = block.match(/\{(.*?)\}/g);
                    if (rows) {
                        rows.forEach(r => {
                            const reqM = r.match(/requirement["']?\s*[:=]\s*["']([^"\\\\]*(?:\\\\.[^"\\\\]*)*)["']/i);
                            const matM = r.match(/our_match["']?\s*[:=]\s*["']([^"\\\\]*(?:\\\\.[^"\\\\]*)*)["']/i);
                            const statM = r.match(/status["']?\s*[:=]\s*["']([^"\\\\]*(?:\\\\.[^"\\\\]*)*)["']/i);
                            if (reqM) {
                                technical_analysis.push({
                                    requirement: reqM[1].replace(/\\"/g, '"'),
                                    our_match: matM ? matM[1].replace(/\\"/g, '"') : "Matches requirements",
                                    status: statM ? statM[1].replace(/\\"/g, '"') : "Compliant"
                                });
                            }
                        });
                    }
                }

                if (technical_analysis.length === 0) {
                    technical_analysis.push({ requirement: "General Platform Architecture", our_match: "Platform aligns heavily with the requested infrastructure.", status: "Compliant" });
                    technical_analysis.push({ requirement: "Core Specifications & SLA", our_match: "Demonstrated compliance via existing features.", status: "Compliant" });
                    technical_analysis.push({ requirement: "Security Standards", our_match: "Meets primary compliance benchmarks natively.", status: "Compliant" });
                }

                const extractedData = {
                    win_probability: winProb,
                    reasoning: reasoning.replace(/\\n/g, '\n'),
                    technical_analysis: technical_analysis,
                    pricing_estimation: {
                        market_value: marketVal,
                        suggested_bid: sugBid
                    },
                    email_draft: emailDraft.replace(/\\n/g, '\n')
                };

                if (validateAnalysisData(extractedData)) {
                    console.log('✅ Strategy 3: Brute-Force successful');
                    return extractedData;
                }
            } catch (e) {
                console.log('Strategy 3 failed', e);
            }

            // Strategy 4: Fallback generic
            console.log('All strategies failed. Creating final fallback...');
            showToast('⚠️ AI format could not be verified. Loading structured fallback...');
            return createFallbackAnalysis(content);
        }

        function validateAnalysisData(data) {
            if (!data) return false;
            
            // Normalize
            if (typeof data.win_probability === 'string') {
                data.win_probability = parseInt(data.win_probability, 10);
            }
            if (isNaN(data.win_probability)) data.win_probability = 50;

            // Ensure basic structural presence
            return typeof data.win_probability === 'number' && 
                   data.win_probability >= 0 && 
                   data.win_probability <= 100 &&
                   (typeof data.reasoning === 'string' || typeof data.email_draft === 'string');
        }

        function createFallbackAnalysis(aiResponse) {
            console.log('Creating intelligent fallback from AI response...');
            
            // Extract key information from the AI response text
            const text = aiResponse.toLowerCase();
            
            // Estimate win probability based on keywords
            let winProb = 50; // default
            if (text.includes('strong') || text.includes('excellent') || text.includes('perfect')) winProb += 20;
            if (text.includes('competitive') || text.includes('good') || text.includes('suitable')) winProb += 10;
            if (text.includes('weak') || text.includes('poor') || text.includes('insufficient')) winProb -= 20;
            if (text.includes('compliant') || text.includes('meets') || text.includes('exceeds')) winProb += 15;
            
            winProb = Math.max(10, Math.min(95, winProb)); // Keep between 10-95
            
            return {
                "win_probability": winProb,
                "reasoning": "Analysis based on AI response: " + (aiResponse.substring(0, 200) + "..."),
                "technical_analysis": [
                    { "requirement": "Overall Assessment", "our_match": "Based on AI analysis", "status": "Partial" }
                ],
                "pricing_estimation": {
                    "market_value": "Market rate analysis needed",
                    "suggested_bid": "Competitive pricing recommended"
                },
                "email_draft": `Dear Client,

Based on our analysis of your RFP requirements, we believe we have a strong solution to offer.

${aiResponse.substring(0, 500)}...

We would welcome the opportunity to discuss this proposal further.

Best regards,
Diamond Swagger Team`
            };
        }

        // --- DEMO DATA ---
        async function loadDemoData() {
            g_analysisData = {
                "win_probability": 87,
                "reasoning": "Strong technical alignment with 95% of requirements. Competitive pricing and superior support offering.",
                "technical_analysis": [
                    { "requirement": "99.9% uptime guarantee", "our_match": "99.99% SLA with financial backing", "status": "Compliant" },
                    { "requirement": "Automated scaling", "our_match": "AI-powered auto-scaling", "status": "Compliant" },
                    { "requirement": "24/7 support", "our_match": "Premium 24/7 support with 15min response", "status": "Compliant" },
                    { "requirement": "Data encryption", "our_match": "AES-256 encryption", "status": "Compliant" },
                    { "requirement": "GDPR compliance", "our_match": "Full GDPR + SOC2 + HIPAA", "status": "Compliant" },
                    { "requirement": "System integration", "our_match": "Hybrid cloud connectors", "status": "Partial" }
                ],
                "pricing_estimation": {
                    "market_value": "$120,000 - $150,000 annually",
                    "suggested_bid": "$115,000 with 2-year commitment"
                },
                "email_draft": `Dear TechCorp Procurement Team,

We are pleased to submit our proposal for your cloud infrastructure requirements.

Our Diamond Swagger Cloud Platform exceeds your specifications:
✅ 99.99% Uptime SLA (exceeds your 99.9% requirement)
✅ AI-Powered Auto-Scaling with predictive capacity
✅ 24/7 Premium Support (15-minute response time)
✅ Enterprise Security: AES-256, GDPR, SOC2, HIPAA
✅ Seamless hybrid cloud integration
✅ Real-time analytics dashboard

Commercial Proposal:
• Annual Cost: $115,000 (2-year commitment)
• Market savings: ~15% below average
• Implementation: 30 days
• Payment terms: Net 30

We have successfully deployed similar solutions for Fortune 500 clients with documented 99.99% uptime.

Best regards,
Diamond Swagger Solutions Team`
            };

            setAgentStatus('done');
            renderResults();
            showToast("Demo Mode: Sample analysis loaded!");
        }

        // --- RESULTS RENDERING ---
        function renderResults() {
            if (!g_analysisData) return;

            switchView('results');

            // Win Probability
            const winProb = g_analysisData.win_probability;
            document.getElementById('winProbDisplay').innerText = winProb + "%";
            
            if (winProb > 70) {
                document.getElementById('winProbDisplay').style.color = 'var(--accent-green)';
            } else if (winProb > 40) {
                document.getElementById('winProbDisplay').style.color = '#f59e0b';
            } else {
                document.getElementById('winProbDisplay').style.color = '#ef4444';
            }
            
            document.getElementById('winReasonDisplay').innerText = g_analysisData.reasoning;
            renderChart(winProb);

            // Technical Analysis Table
            const tbody = document.getElementById('techTableBody');
            tbody.innerHTML = '';
            
            if (g_analysisData.technical_analysis) {
                g_analysisData.technical_analysis.forEach(row => {
                    let badgeClass = 'badge';
                    let badgeStyle = '';
                    
                    if (row.status === 'Compliant') {
                        badgeClass = 'badge-high';
                    } else if (row.status === 'Partial') {
                        badgeStyle = 'color: #f59e0b; background: rgba(245, 158, 11, 0.15);';
                    } else {
                        badgeStyle = 'color: #ef4444; background: rgba(239, 68, 68, 0.15);';
                    }
                    
                    tbody.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td>${row.requirement}</td>
                            <td>${row.our_match}</td>
                            <td><span class="${badgeClass}" style="${badgeStyle}">${row.status}</span></td>
                        </tr>
                    `);
                });
            }

            // Pricing
            if (g_analysisData.pricing_estimation) {
                document.getElementById('pricingMarketDisplay').innerText = g_analysisData.pricing_estimation.market_value || "--";
                document.getElementById('pricingBidDisplay').innerText = g_analysisData.pricing_estimation.suggested_bid || "--";
            }

            // Proposal Document
            document.getElementById('finalDocPreview').innerText = g_analysisData.email_draft || "No proposal generated.";
            
            // Auto-save to history
            autoSaveToHistory();
        }
        
        // Auto-save analysis to history (without duplicate check)
        function autoSaveToHistory() {
            if (!g_analysisData) return;
            
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            
            // Check if this exact analysis is already saved (by timestamp or content)
            const clientName = document.getElementById('clientName').value || 'Untitled';
            const rfpText = document.getElementById('rfpText').value || '';
            
            // Avoid duplicate saves (check last 3 entries)
            const isDuplicate = history.slice(0, 3).some(item => 
                item.clientName === clientName && 
                item.winProbability === g_analysisData.win_probability &&
                item.rfpText?.substring(0, 100) === rfpText.substring(0, 100)
            );
            
            if (isDuplicate) return;
            
            const entry = {
                clientName: clientName,
                category: document.getElementById('rfpCategory').value || '',
                rfpText: rfpText,
                productContext: document.getElementById('myProductContext').value || '',
                analysisData: g_analysisData,
                winProbability: g_analysisData.win_probability,
                savedAt: new Date().toISOString()
            };
            
            history.unshift(entry);
            if (history.length > 20) history.pop();
            
            localStorage.setItem('titans_proposal_history', JSON.stringify(history));
            console.log('Auto-saved to history:', clientName);
        }

        // --- CHART RENDERING ---
        function renderChart(percent) {
            const ctx = document.getElementById('winChart').getContext('2d');
            if (window.myWinChart) window.myWinChart.destroy();
            
            let backgroundColor = percent > 70 ? ['#10b981', '#e2e8f0'] : 
                                 percent > 40 ? ['#f59e0b', '#e2e8f0'] : 
                                               ['#ef4444', '#e2e8f0'];
            
            window.myWinChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Win Chance', 'Risk'],
                    datasets: [{
                        data: [percent, 100-percent],
                        backgroundColor: backgroundColor,
                        borderWidth: 0
                    }]
                },
                options: { 
                    cutout: '75%', 
                    plugins: { legend: { display: false } }, 
                    responsive: true, 
                    maintainAspectRatio: false 
                }
            });
        }

        // --- UTILITY FUNCTIONS ---
        
        // Agent Architecture Status Management
        function setAgentArchitectureStatus(agentId, status, progress = 0) {
            const row = document.getElementById(`agent-${agentId}`);
            const badge = document.getElementById(`status-${agentId}`);
            const ring = document.getElementById(`ring-${agentId}`);
            const fill = document.getElementById(`fill-${agentId}`);
            const percent = document.getElementById(`percent-${agentId}`);
            
            // Note: In the older HTML version 'agent-sales' etc may have been just row-index. Let's fix that check
            const targetRow = row || document.querySelector(`.agent-row:has(#status-${agentId})`);
            
            if (!targetRow || !badge) return;
            
            targetRow.classList.remove('running', 'completed');
            badge.classList.remove('running', 'done');
            
            if (status === 'running') {
                targetRow.classList.add('running');
                badge.classList.add('running');
                
                const statusText = badge.querySelector('.status-text');
                if (statusText) statusText.textContent = 'Running';
                if (ring) ring.style.display = 'flex';
                
                if (fill && percent) {
                    fill.setAttribute('stroke-dasharray', `${progress}, 100`);
                    percent.textContent = `${Math.round(progress)}%`;
                }
            } else if (status === 'done') {
                targetRow.classList.add('completed');
                badge.classList.add('done');
                
                const statusText = badge.querySelector('.status-text');
                if (statusText) {
                    statusText.innerHTML = '<i class="fas fa-check"></i> Complete';
                }
                if (ring) ring.style.display = 'flex';
                if (fill && percent) {
                    fill.setAttribute('stroke-dasharray', `100, 100`);
                    percent.textContent = `100%`;
                }
            } else {
                const statusText = badge.querySelector('.status-text');
                if (statusText) statusText.textContent = 'Waiting';
                if (ring) ring.style.display = 'none';
            }
        }

        function updateMasterProgress(percentage) {
            const fill = document.getElementById('analysis-progress-fill');
            const text = document.getElementById('analysis-percentage');
            if (fill) fill.style.width = percentage + '%';
            if (text) text.textContent = Math.round(percentage) + '%';
        }

        // Reset all agents to waiting state
        function resetAgentArchitecture() {
            ['sales', 'technical', 'pricing', 'orchestrator'].forEach(agent => {
                setAgentArchitectureStatus(agent, 'waiting');
            });
            updateMasterProgress(0);
        }

        // Functions for the Manual Proceed Flow
        function startSalesAgent() {
            updateWorkflowStep(1);
            resetAgentArchitecture();
            
            const btn = document.getElementById('runSalesBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting...';
            btn.disabled = true;
            
            setAgentArchitectureStatus('sales', 'running', 0);
            
            // Scroll to the agent architecture execution container so user can see progress
            const architectureCard = document.getElementById('agent-architecture-card');
            if (architectureCard) {
                architectureCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            setAgentArchitectureStatus('sales', 'done');
            updateMasterProgress(25);
            btn.style.display = 'none';
            document.getElementById('proceed-container').style.display = 'none';
            startGeminiAnalysis();
        }

        function archiveRFP() {
            document.getElementById('proceed-container').style.display = 'none';
            const btn = document.getElementById('runSalesBtn');
            btn.style.display = 'inline-flex';
            btn.innerHTML = '<i class="fas fa-bolt"></i> Run Full Analysis';
            btn.disabled = false;
            resetAgentArchitecture();
            showToast("RFP Archived. Workflow stopped.");
        }

        // Animate agent workflow during analysis
        async function animateAgentWorkflow() {
            // Master percentage resets but since sales already done we start at 25
            updateMasterProgress(25);
            setAgentArchitectureStatus('sales', 'done');
            
            updateWorkflowStep(2);
            // Technical Agent - SKU Matching
            await runAgentWithProgress('technical', 25, 50, 1000);
            
            updateWorkflowStep(3);
            // Pricing Agent - Cost Estimation
            await runAgentWithProgress('pricing', 50, 75, 800);
            
            updateWorkflowStep(4);
            // Orchestrator Agent - Compilation
            await runAgentWithProgress('orchestrator', 75, 100, 700);
            
            showToast("✅ Full Agentic Analysis Complete!");
        }

        async function runAgentWithProgress(agentId, startMaster, endMaster, duration) {
            setAgentArchitectureStatus(agentId, 'running', 0);
            
            const steps = 20;
            const stepDuration = duration / steps;
            const masterRange = endMaster - startMaster;
            
            for (let i = 1; i <= steps; i++) {
                if (analysisCompleted) return;
                
                const agentProgress = (i / steps) * 100;
                const masterProgress = startMaster + (i / steps) * masterRange;
                
                setAgentArchitectureStatus(agentId, 'running', agentProgress);
                updateMasterProgress(masterProgress);
                
                await new Promise(r => setTimeout(r, stepDuration));
            }
            
            setAgentArchitectureStatus(agentId, 'done');
        }

        // Legacy function for compatibility
        function setAgentStatus(status) {
            if (status === 'running') {
                animateAgentWorkflow();
            } else if (status === 'done') {
                ['sales', 'technical', 'pricing', 'orchestrator'].forEach(agent => {
                    setAgentArchitectureStatus(agent, 'done');
                });
            } else {
                resetAgentArchitecture();
            }
        }

        function updateWorkflowStep(stepNumber) {
            document.querySelectorAll('.flow-step').forEach((step, index) => {
                step.classList.remove('active', 'completed');
                if (index + 1 < stepNumber) {
                    step.classList.add('completed');
                } else if (index + 1 === stepNumber) {
                    step.classList.add('active');
                }
            });
        }

        function switchView(viewId, element) {
            console.log('Switching to view:', viewId);
            
            // Hide ALL view sections completely - force inline styles
            const allViews = document.querySelectorAll('.view-section');
            console.log('Found views:', allViews.length);
            allViews.forEach(el => {
                el.classList.remove('active');
                el.style.display = 'none';
                el.style.visibility = 'hidden';
            });
            
            // Show the selected view
            const targetView = document.getElementById(`view-${viewId}`);
            if (targetView) {
                targetView.style.display = 'block';
                targetView.style.visibility = 'visible';
                targetView.classList.add('active');
                console.log('Showing view:', targetView.id);
            } else {
                console.error('View not found:', `view-${viewId}`);
            }
            
            // Update nav item active state
            if (element) {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                element.classList.add('active');
            }
            
            // Scroll to top of page
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Close mobile sidebar when navigating
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
            
            // Update URL hash for bookmarking
            window.location.hash = viewId;
        }

        function showToast(msg) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            
            let icon = 'fa-info-circle';
            let borderColor = 'var(--accent-green)';
            
            if (msg.includes('❌')) {
                icon = 'fa-exclamation-circle';
                borderColor = '#ef4444';
            } else if (msg.includes('✅')) {
                icon = 'fa-check-circle';
            }
            
            toast.style.borderLeftColor = borderColor;
            toast.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        }

        function showAnalysisOverlay() {
            let overlay = document.getElementById('analysis-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'analysis-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100vw';
                overlay.style.height = '100vh';
                overlay.style.background = 'rgba(15, 23, 42, 0.75)';
                overlay.style.backdropFilter = 'blur(8px)';
                overlay.style.zIndex = '9999';
                overlay.style.display = 'flex';
                overlay.style.flexDirection = 'column';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = `
                    <div style="background: var(--card-bg); padding: 3rem; border-radius: 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); text-align: center; border: 1px solid var(--border-color); animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                        <div style="position: relative; width: 100px; height: 100px; margin: 0 auto 2rem auto;">
                            <div style="position: absolute; width: 100%; height: 100%; border: 4px solid rgba(66, 133, 244, 0.1); border-radius: 50%;"></div>
                            <div style="position: absolute; width: 100%; height: 100%; border: 4px solid var(--primary-theme); border-radius: 50%; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
                            <i class="fas fa-brain" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; color: var(--primary-theme); animation: pulse 2s infinite;"></i>
                        </div>
                        <h2 style="margin-bottom: 0.5rem; font-weight: 800; background: linear-gradient(135deg, var(--primary-theme), var(--accent-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Agentic Processing...</h2>
                        <p style="color: var(--text-medium); margin-bottom: 0; font-size: 0.95rem;">Diamond Swagger AI is analyzing the RFP requirements</p>
                    </div>
                `;
                document.body.appendChild(overlay);
                
                if (!document.getElementById('overlay-animations')) {
                    const style = document.createElement('style');
                    style.id = 'overlay-animations';
                    style.innerHTML = `
                        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        @keyframes pulse { 0% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.95); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.95); } }
                    `;
                    document.head.appendChild(style);
                }
            }
            overlay.style.display = 'flex';
        }

        function hideAnalysisOverlay() {
            const overlay = document.getElementById('analysis-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        function toggleTheme() {
            const body = document.body;
            const isDark = body.classList.toggle('dark-mode');
            const icon = document.getElementById('theme-icon');
            const text = document.getElementById('theme-text');
            
            if (isDark) {
                icon.className = 'fas fa-sun';
                text.textContent = 'Light Mode';
            } else {
                icon.className = 'fas fa-moon';
                text.textContent = 'Dark Mode';
            }
            
            // Re-apply background for new theme
            applyBackground();
        }

        // Mobile Sidebar Functions
        function toggleMobileSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const menuBtn = document.getElementById('mobileMenuBtn');
            
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
            menuBtn.classList.toggle('active');
            
            // Prevent body scroll when sidebar is open
            if (sidebar.classList.contains('mobile-open')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }

        function closeMobileSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const menuBtn = document.getElementById('mobileMenuBtn');
            
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            menuBtn.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Close sidebar when clicking a nav item on mobile
        function handleMobileNavClick() {
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        }

        // Theme Mode Functions
        function setThemeMode(mode) {
            const body = document.body;
            const icon = document.getElementById('theme-icon');
            const text = document.getElementById('theme-text');
            
            if (mode === 'dark') {
                body.classList.add('dark-mode');
                icon.className = 'fas fa-sun';
                text.textContent = 'Light Mode';
                document.getElementById('theme-dark-btn').classList.add('btn-primary');
                document.getElementById('theme-dark-btn').classList.remove('btn-outline');
                document.getElementById('theme-light-btn').classList.remove('btn-primary');
                document.getElementById('theme-light-btn').classList.add('btn-outline');
            } else {
                body.classList.remove('dark-mode');
                icon.className = 'fas fa-moon';
                text.textContent = 'Dark Mode';
                document.getElementById('theme-light-btn').classList.add('btn-primary');
                document.getElementById('theme-light-btn').classList.remove('btn-outline');
                document.getElementById('theme-dark-btn').classList.remove('btn-primary');
                document.getElementById('theme-dark-btn').classList.add('btn-outline');
            }
            
            localStorage.setItem('titans_theme', mode);
            
            // Re-apply background for new theme
            applyBackground();
            
            showToast('✅ Theme changed to ' + mode.charAt(0).toUpperCase() + mode.slice(1) + ' Mode');
        }

        // Pattern Selector Functions
        function togglePatternSelector() {
            const content = document.getElementById('pattern-selector-content');
            const icon = document.getElementById('pattern-toggle-icon');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.style.transform = 'rotate(180deg)';
            } else {
                content.style.display = 'none';
                icon.style.transform = 'rotate(0deg)';
            }
        }

        // Gradient Selector Functions
        function toggleGradientSelector() {
            const content = document.getElementById('gradient-selector-content');
            const icon = document.getElementById('gradient-toggle-icon');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.style.transform = 'rotate(180deg)';
            } else {
                content.style.display = 'none';
                icon.style.transform = 'rotate(0deg)';
            }
        }

        // Gradient definitions
        const gradientDefs = {
            golden: { light: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 25%, #fde68a 50%, #fcd34d 75%, #fbbf24 100%)', dark: 'linear-gradient(135deg, #451a03 0%, #78350f 25%, #92400e 50%, #b45309 75%, #d97706 100%)' },
            purple: { light: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 25%, #e9d5ff 50%, #d8b4fe 75%, #c4b5fd 100%)', dark: 'linear-gradient(135deg, #2e1065 0%, #3b0764 25%, #581c87 50%, #6b21a8 75%, #7e22ce 100%)' },
            ocean: { light: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 25%, #a5f3fc 50%, #67e8f9 75%, #22d3ee 100%)', dark: 'linear-gradient(135deg, #083344 0%, #164e63 25%, #155e75 50%, #0e7490 75%, #0891b2 100%)' },
            rose: { light: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 25%, #fecdd3 50%, #fda4af 75%, #fb7185 100%)', dark: 'linear-gradient(135deg, #4c0519 0%, #881337 25%, #9f1239 50%, #be123c 75%, #e11d48 100%)' },
            emerald: { light: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 25%, #a7f3d0 50%, #6ee7b7 75%, #34d399 100%)', dark: 'linear-gradient(135deg, #022c22 0%, #064e3b 25%, #065f46 50%, #047857 75%, #059669 100%)' },
            sunset: { light: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 20%, #fed7aa 40%, #fdba74 60%, #fb923c 80%, #f97316 100%)', dark: 'linear-gradient(135deg, #431407 0%, #7c2d12 20%, #9a3412 40%, #c2410c 60%, #ea580c 80%, #f97316 100%)' },
            sky: { light: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 25%, #bae6fd 50%, #7dd3fc 75%, #38bdf8 100%)', dark: 'linear-gradient(135deg, #082f49 0%, #0c4a6e 25%, #075985 50%, #0369a1 75%, #0284c7 100%)' },
            lavender: { light: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 25%, #f5d0fe 50%, #e879f9 75%, #d946ef 100%)', dark: 'linear-gradient(135deg, #4a044e 0%, #701a75 25%, #86198f 50%, #a21caf 75%, #c026d3 100%)' },
            mint: { light: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 25%, #bbf7d0 50%, #86efac 75%, #4ade80 100%)', dark: 'linear-gradient(135deg, #052e16 0%, #14532d 25%, #166534 50%, #15803d 75%, #16a34a 100%)' },
            coral: { light: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 25%, #fecaca 50%, #fca5a5 75%, #f87171 100%)', dark: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 25%, #991b1b 50%, #b91c1c 75%, #dc2626 100%)' },
            indigo: { light: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 25%, #c7d2fe 50%, #a5b4fc 75%, #818cf8 100%)', dark: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 25%, #3730a3 50%, #4338ca 75%, #4f46e5 100%)' },
            slate: { light: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 50%, #cbd5e1 75%, #94a3b8 100%)', dark: 'linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #334155 50%, #475569 75%, #64748b 100%)' },
            white: { light: '#ffffff', dark: '#121212' }
        };

        // Pattern definitions (SVG data URIs)
        const patternDefs = {
            hexagon: { light: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.35'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", dark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.25'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", size: '56px 98px' },
            topography: { light: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Cpath fill='none' stroke='%23000' stroke-width='3' stroke-opacity='0.35' d='M239 220c-27 0-54 9-75 27-42 36-48 99-14 143 17 22 42 36 69 40 27 4 55-2 78-18 46-32 57-95 25-141-16-23-40-39-67-46-5-1-11-3-16-5z'/%3E%3C/svg%3E\")", dark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='3' stroke-opacity='0.25' d='M239 220c-27 0-54 9-75 27-42 36-48 99-14 143 17 22 42 36 69 40 27 4 55-2 78-18 46-32 57-95 25-141-16-23-40-39-67-46-5-1-11-3-16-5z'/%3E%3C/svg%3E\")", size: '300px 300px' },
            circuit: { light: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='%23000' fill-opacity='0.30'%3E%3Crect x='0' y='48' width='100' height='4'/%3E%3Crect x='48' y='0' width='4' height='100'/%3E%3Ccircle cx='50' cy='50' r='6'/%3E%3Ccircle cx='0' cy='50' r='4'/%3E%3Ccircle cx='100' cy='50' r='4'/%3E%3Ccircle cx='50' cy='0' r='4'/%3E%3Ccircle cx='50' cy='100' r='4'/%3E%3C/g%3E%3C/svg%3E\")", dark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='%23fff' fill-opacity='0.20'%3E%3Crect x='0' y='48' width='100' height='4'/%3E%3Crect x='48' y='0' width='4' height='100'/%3E%3Ccircle cx='50' cy='50' r='6'/%3E%3Ccircle cx='0' cy='50' r='4'/%3E%3Ccircle cx='100' cy='50' r='4'/%3E%3Ccircle cx='50' cy='0' r='4'/%3E%3Ccircle cx='50' cy='100' r='4'/%3E%3C/g%3E%3C/svg%3E\")", size: '50px 50px' },
            dots: { light: 'radial-gradient(circle, rgba(0,0,0,0.4) 3px, transparent 3px)', dark: 'radial-gradient(circle, rgba(255,255,255,0.3) 3px, transparent 3px)', size: '20px 20px' },
            diagonal: { light: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.25) 10px, rgba(0,0,0,0.25) 13px)', dark: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.18) 10px, rgba(255,255,255,0.18) 13px)', size: '100% 100%' },
            waves: { light: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='20' viewBox='0 0 100 20'%3E%3Cpath fill='none' stroke='%23000' stroke-width='4' stroke-opacity='0.30' d='M0 10c25 0 25-10 50-10s25 10 50 10 25-10 50-10'/%3E%3C/svg%3E\")", dark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='20' viewBox='0 0 100 20'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='4' stroke-opacity='0.20' d='M0 10c25 0 25-10 50-10s25 10 50 10 25-10 50-10'/%3E%3C/svg%3E\")", size: '100px 20px' },
            triangles: { light: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='72' viewBox='0 0 36 72'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='0.30'%3E%3Cpath d='M2 6h12L8 18 2 6zm18 36h12l-6 12-6-12z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", dark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='72' viewBox='0 0 36 72'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.20'%3E%3Cpath d='M2 6h12L8 18 2 6zm18 36h12l-6 12-6-12z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", size: '36px 72px' },
            none: { light: 'none', dark: 'none', size: '100% 100%' }
        };

        // Apply combined background
        function applyBackground() {
            const mainContent = document.querySelector('.main-content');
            const isDark = document.body.classList.contains('dark-mode');
            const currentGradient = localStorage.getItem('titans_gradient') || 'white';
            const currentPattern = localStorage.getItem('titans_pattern') || 'none';
            
            const gradient = gradientDefs[currentGradient] || gradientDefs.white;
            const pattern = patternDefs[currentPattern] || patternDefs.none;
            
            const gradientValue = isDark ? gradient.dark : gradient.light;
            const patternValue = isDark ? pattern.dark : pattern.light;
            
            if (currentPattern === 'none') {
                mainContent.style.background = gradientValue;
                mainContent.style.backgroundSize = '100% 100%';
            } else {
                mainContent.style.background = patternValue + ' repeat, ' + gradientValue;
                mainContent.style.backgroundSize = pattern.size + ', 100% 100%';
            }
        }

        function setGradient(gradientName) {
            // Update active state in selector
            document.querySelectorAll('[data-gradient]').forEach(opt => {
                opt.classList.remove('active');
                if (opt.dataset.gradient === gradientName) {
                    opt.classList.add('active');
                }
            });
            
            // Update the label showing current gradient
            const label = document.getElementById('current-gradient-label');
            if (label) {
                label.textContent = '(' + gradientName.charAt(0).toUpperCase() + gradientName.slice(1) + ')';
            }
            
            // Save preference and apply
            localStorage.setItem('titans_gradient', gradientName);
            applyBackground();
            showToast('✅ Background color changed to ' + gradientName.charAt(0).toUpperCase() + gradientName.slice(1));
        }

        function setPattern(patternName) {
            // Update active state in selector
            document.querySelectorAll('[data-pattern]').forEach(opt => {
                opt.classList.remove('active');
                if (opt.dataset.pattern === patternName) {
                    opt.classList.add('active');
                }
            });
            
            // Update the label showing current pattern
            const label = document.getElementById('current-pattern-label');
            if (label) {
                label.textContent = '(' + patternName.charAt(0).toUpperCase() + patternName.slice(1) + ')';
            }
            
            // Save preference and apply
            localStorage.setItem('titans_pattern', patternName);
            applyBackground();
            showToast('✅ Pattern changed to ' + patternName.charAt(0).toUpperCase() + patternName.slice(1));
        }

        // Load saved pattern, gradient and theme on page load
        function loadSavedPattern() {
            // Load pattern
            const savedPattern = localStorage.getItem('titans_pattern') || 'hexagon';
            
            // Update pattern selector UI
            document.querySelectorAll('[data-pattern]').forEach(opt => {
                opt.classList.remove('active');
                if (opt.dataset.pattern === savedPattern) {
                    opt.classList.add('active');
                }
            });
            
            // Update the label showing current pattern
            const patternLabel = document.getElementById('current-pattern-label');
            if (patternLabel) {
                patternLabel.textContent = '(' + savedPattern.charAt(0).toUpperCase() + savedPattern.slice(1) + ')';
            }
            
            // Load gradient
            const savedGradient = localStorage.getItem('titans_gradient') || 'golden';
            
            // Update gradient selector UI
            document.querySelectorAll('[data-gradient]').forEach(opt => {
                opt.classList.remove('active');
                if (opt.dataset.gradient === savedGradient) {
                    opt.classList.add('active');
                }
            });
            
            // Update the label showing current gradient
            const gradientLabel = document.getElementById('current-gradient-label');
            if (gradientLabel) {
                gradientLabel.textContent = '(' + savedGradient.charAt(0).toUpperCase() + savedGradient.slice(1) + ')';
            }
            
            // Apply the combined background
            applyBackground();
            
            // Load theme and update buttons
            const isDark = document.body.classList.contains('dark-mode');
            const lightBtn = document.getElementById('theme-light-btn');
            const darkBtn = document.getElementById('theme-dark-btn');
            
            if (lightBtn && darkBtn) {
                if (isDark) {
                    darkBtn.classList.add('btn-primary');
                    darkBtn.classList.remove('btn-outline');
                    lightBtn.classList.remove('btn-primary');
                    lightBtn.classList.add('btn-outline');
                } else {
                    lightBtn.classList.add('btn-primary');
                    lightBtn.classList.remove('btn-outline');
                    darkBtn.classList.remove('btn-primary');
                    darkBtn.classList.add('btn-outline');
                }
            }
        }

        function copyToClipboard() {
            const text = document.getElementById('finalDocPreview').innerText;
            navigator.clipboard.writeText(text)
                .then(() => showToast("✅ Proposal copied to clipboard!"))
                .catch(err => showToast("❌ Failed to copy: " + err));
        }

        function downloadPDF() {
            if (!g_analysisData) {
                showToast("⚠️ No analysis data to export. Run analysis first.");
                return;
            }
            
            showToast("📄 Generating PDF...");
            
            const winProb = g_analysisData.win_probability || 0;
            const reasoning = g_analysisData.reasoning || 'N/A';
            const techAnalysis = g_analysisData.technical_analysis || [];
            const pricing = g_analysisData.pricing_estimation || {};
            const emailDraft = g_analysisData.email_draft || '';
            
            const htmlString = `
                <div style="padding: 20px; font-family: Arial, sans-serif; background: white; color: #333; width: 800px;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #4285f4; padding-bottom: 20px;">
                    <h1 style="color: #4285f4; margin: 0;">🏆 Diamond Swagger AI</h1>
                    <p style="color: #666; margin: 5px 0;">RFP Analysis Report</p>
                    <p style="color: #999; font-size: 12px;">Generated: ${new Date().toLocaleString()}</p>
                </div>
                
                <div style="background: ${winProb > 70 ? '#d4edda' : winProb > 40 ? '#fff3cd' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <h2 style="margin: 0; color: ${winProb > 70 ? '#155724' : winProb > 40 ? '#856404' : '#721c24'};">Win Probability: ${winProb}%</h2>
                    <p style="margin: 10px 0 0 0; color: #666;">${reasoning}</p>
                </div>
                
                <h3 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 5px;">📋 Technical Analysis</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f8f9fa;">
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Requirement</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Our Match</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${techAnalysis.map(item => `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd;">${item.requirement || ''}</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${item.our_match || ''}</td>
                                <td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: ${item.status === 'Compliant' ? '#28a745' : item.status === 'Partial' ? '#ffc107' : '#dc3545'};">${item.status || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <h3 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 5px;">💰 Pricing Estimation</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong>Market Value:</strong> ${pricing.market_value || 'N/A'}</p>
                    <p><strong>Suggested Bid:</strong> ${pricing.suggested_bid || 'N/A'}</p>
                </div>
                
                <h3 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 5px;">✉️ Email Draft</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; white-space: pre-wrap; font-size: 13px;">
${emailDraft}
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #ddd; padding-top: 15px;">
                    Generated by Diamond Swagger AI - RFP Automation Platform
                </div>
                </div>
            `;
            
            // PDF options
            const opt = {
                margin: 10,
                filename: 'titans_RFP_Analysis_' + new Date().toISOString().split('T')[0] + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            // Absolutely guarantee html2canvas paints by forcing it to be perfectly visible and on top.
            // Aggressive browsers cull negative z-indexes or off-screen nodes causing blank PDFs.
            const renderTarget = document.createElement('div');
            // Hard-strip all non-ASCII characters (including emojis) to prevent the html2canvas parsing engine from crashing
            renderTarget.innerHTML = htmlString.replace(/[^\x00-\x7F]/g, " "); 
            
            renderTarget.style.position = 'absolute';
            renderTarget.style.top = '0px';
            renderTarget.style.left = '0px';
            renderTarget.style.width = '800px';
            renderTarget.style.backgroundColor = '#ffffff';
            renderTarget.style.color = '#333333';
            renderTarget.style.zIndex = '100000'; // Make it top-level!
            document.body.appendChild(renderTarget);

            // Create a loading overlay to cover the messy raw HTML from the user's eyes
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.backgroundColor = '#ffffff';
            overlay.style.zIndex = '100001'; // Covers everything, including the renderTarget!
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 40px; color: #4285f4; margin-bottom: 20px;"></i><h2 style="color: #4285f4;">Optimizing and Generating Document...</h2>';
            document.body.appendChild(overlay);

            // Scroll to top so coordinate geometry matches cleanly
            window.scrollTo(0, 0);

            // Wait 250ms for CSSOM reflows and paint pipeline to fully instantiate visible bounding boxes
            setTimeout(() => {
                const opt = {
                    margin: 10,
                    filename: 'titans_RFP_Analysis_' + new Date().toISOString().split('T')[0] + '.pdf',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                
                html2pdf().set(opt).from(renderTarget).save().then(() => {
                    if (document.body.contains(renderTarget)) document.body.removeChild(renderTarget);
                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    showToast("✅ PDF downloaded successfully!");
                }).catch(err => {
                    if (document.body.contains(renderTarget)) document.body.removeChild(renderTarget);
                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    console.error('PDF Error:', err);
                    showToast("❌ PDF generation failed.");
                });
            }, 250);
        }

        // Open login page
        function openLoginPage() {
            window.location.href = 'google_login.html';
        }

        // Add creators footer to all pages
        function addCreatorsFooter() {
            const footer = document.createElement('div');
            footer.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 0.75rem;
                color: var(--text-medium);
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 100;
                cursor: pointer;
                transition: all 0.2s;
            `;
            
            footer.innerHTML = `
                <i class="fas fa-users" style="margin-right: 5px; color: var(--primary-theme);"></i>
                Created by Diamond Swagger Team
            `;
            
            footer.onclick = () => switchView('creators');
            footer.onmouseover = () => {
                footer.style.transform = 'translateY(-2px)';
                footer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            };
            footer.onmouseout = () => {
                footer.style.transform = 'translateY(0)';
                footer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            };
            
            document.body.appendChild(footer);
        }

        // Initialize creators footer
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(addCreatorsFooter, 1000);
        });

        // Handle window resize - close mobile sidebar if window becomes larger
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                closeMobileSidebar();
            }
        });

        // ============================================
        // NEW FEATURES: Templates, History, Export, etc.
        // ============================================

        // RFP Templates Data
        const rfpTemplates = {
            'it-services': {
                name: 'IT Services',
                category: 'Information Technology, Cloud Computing, Software Development',
                context: 'We provide enterprise IT solutions including cloud infrastructure, custom software development, cybersecurity services, and 24/7 technical support. Our team has 10+ years experience with Fortune 500 clients.',
                sampleRfp: 'Looking for a technology partner to modernize our IT infrastructure. Requirements include: cloud migration, data security compliance (SOC2, GDPR), 99.9% uptime SLA, scalable architecture, and dedicated support team.'
            },
            'construction': {
                name: 'Construction',
                category: 'Construction, Civil Engineering, Building Projects',
                context: 'We are a licensed general contractor with expertise in commercial and residential construction. Our portfolio includes office buildings, retail spaces, and infrastructure projects. Safety-first approach with OSHA compliance.',
                sampleRfp: 'Seeking qualified contractor for new office building construction. Project scope: 50,000 sq ft, 3 floors, LEED certification required, completion within 18 months, budget range $15-20M.'
            },
            'consulting': {
                name: 'Consulting',
                category: 'Business Strategy, Management Consulting, Advisory',
                context: 'Our consulting firm specializes in digital transformation, operational efficiency, and strategic planning. We have helped 200+ organizations achieve measurable business outcomes.',
                sampleRfp: 'Need strategic consulting services for digital transformation initiative. Looking for expertise in change management, process optimization, and technology roadmap development. 6-month engagement.'
            },
            'healthcare': {
                name: 'Healthcare',
                category: 'Healthcare IT, Medical Equipment, Health Services',
                context: 'We provide HIPAA-compliant healthcare solutions including EHR systems, medical devices, and telehealth platforms. FDA registered and ISO 13485 certified.',
                sampleRfp: 'Hospital seeking integrated EHR system with patient portal, telehealth capabilities, and HL7 FHIR interoperability. Must be HIPAA compliant with 24/7 support.'
            },
            'manufacturing': {
                name: 'Manufacturing',
                category: 'Industrial Equipment, Supply Chain, Production',
                context: 'We manufacture precision industrial equipment with ISO 9001 certification. Our products include automation systems, quality control equipment, and custom machinery.',
                sampleRfp: 'Manufacturing facility needs automated assembly line equipment. Requirements: 500 units/hour capacity, quality inspection integration, predictive maintenance, and operator training.'
            },
            'government': {
                name: 'Government',
                category: 'Public Sector, Federal, State, Municipal',
                context: 'We are a certified government contractor (GSA Schedule, 8(a), HUBZone) with experience in federal, state, and local government projects. FedRAMP authorized solutions.',
                sampleRfp: 'City government seeking vendor for citizen services portal. Must include online permit applications, payment processing, accessibility compliance (WCAG 2.1), and multi-language support.'
            },
            'education': {
                name: 'Education',
                category: 'K-12, Higher Education, E-Learning',
                context: 'We develop educational technology solutions including LMS platforms, virtual classrooms, and student information systems. FERPA compliant with accessibility features.',
                sampleRfp: 'University needs learning management system for 25,000 students. Requirements: video conferencing, assignment submission, grade book, plagiarism detection, and mobile app.'
            },
            'finance': {
                name: 'Finance',
                category: 'Banking, Insurance, Fintech',
                context: 'We provide financial technology solutions with PCI-DSS compliance. Our products include payment processing, fraud detection, and regulatory reporting systems.',
                sampleRfp: 'Bank seeking core banking system modernization. Requirements: real-time transactions, API banking, regulatory compliance (Basel III), and legacy system integration.'
            }
        };

        // Templates Modal Functions
        function showTemplatesModal() {
            document.getElementById('templates-modal').classList.add('active');
        }

        function closeTemplatesModal() {
            document.getElementById('templates-modal').classList.remove('active');
        }

        function loadTemplate(templateId) {
            const template = rfpTemplates[templateId];
            if (template) {
                document.getElementById('rfpCategory').value = template.category;
                document.getElementById('myProductContext').value = '';
                document.getElementById('rfpText').value = '';
                closeTemplatesModal();
                showNewProposalForm();
                showToast(`✅ Selected ${template.name} sector`);
            }
        }

        // History Functions
        function showHistoryModal() {
            loadHistoryList();
            document.getElementById('history-modal').classList.add('active');
        }

        function closeHistoryModal() {
            document.getElementById('history-modal').classList.remove('active');
        }

        function loadHistoryList() {
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            const listEl = document.getElementById('history-list');
            const emptyEl = document.getElementById('history-empty');
            
            if (history.length === 0) {
                listEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }
            
            listEl.style.display = 'block';
            emptyEl.style.display = 'none';
            
            listEl.innerHTML = history.map((item, index) => {
                const isFavorite = favorites.some(f => f.savedAt === item.savedAt);
                return `
                <div class="history-item" onclick="loadFromHistory(${index})">
                    <div class="history-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="history-info">
                        <h4>${item.clientName || 'Untitled Proposal'}</h4>
                        <p>${item.category || 'No category'} • ${new Date(item.savedAt).toLocaleDateString()} • Win: ${item.winProbability || '--'}%</p>
                    </div>
                    <div class="history-actions">
                        <button onclick="event.stopPropagation(); toggleFavorite(${index})" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" class="favorite-btn ${isFavorite ? 'active' : ''}">
                            <i class="fas fa-star"></i>
                        </button>
                        <button onclick="event.stopPropagation(); deleteFromHistory(${index})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `}).join('');
        }

        function saveToHistory() {
            if (!g_analysisData) {
                showToast('❌ No analysis to save. Run an analysis first.');
                return;
            }
            
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            
            const entry = {
                clientName: document.getElementById('clientName').value || 'Untitled',
                category: document.getElementById('rfpCategory').value,
                rfpText: document.getElementById('rfpText').value,
                productContext: document.getElementById('myProductContext').value,
                analysisData: g_analysisData,
                winProbability: g_analysisData.win_probability,
                savedAt: new Date().toISOString()
            };
            
            history.unshift(entry); // Add to beginning
            if (history.length > 20) history.pop(); // Keep max 20 items
            
            localStorage.setItem('titans_proposal_history', JSON.stringify(history));
            showToast('✅ Proposal saved to history');
        }

        function loadFromHistory(index) {
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            const item = history[index];
            
            if (item) {
                document.getElementById('clientName').value = item.clientName || '';
                document.getElementById('rfpCategory').value = item.category || '';
                document.getElementById('rfpText').value = item.rfpText || '';
                document.getElementById('myProductContext').value = item.productContext || '';
                g_analysisData = item.analysisData;
                
                closeHistoryModal();
                
                if (g_analysisData) {
                    renderResults();
                    showToast('✅ Loaded proposal from history');
                } else {
                    showNewProposalForm();
                    showToast('✅ Loaded proposal draft from history');
                }
            }
        }

        function deleteFromHistory(index) {
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            history.splice(index, 1);
            localStorage.setItem('titans_proposal_history', JSON.stringify(history));
            loadHistoryList();
            showToast('🗑️ Proposal deleted');
        }

        function clearHistory() {
            if (confirm('Are you sure you want to delete all saved proposals?')) {
                localStorage.removeItem('titans_proposal_history');
                loadHistoryList();
                showToast('🗑️ History cleared');
            }
        }

        // DOCX Export Function
        async function downloadDOCX() {
            if (!g_analysisData) {
                showToast('❌ No analysis data. Run analysis first.');
                return;
            }
            
            showToast('📄 Generating Word document...');
            
            try {
                const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;
                
                const clientName = document.getElementById('clientName').value || 'Client';
                const category = document.getElementById('rfpCategory').value || 'RFP';
                
                // Create document
                const doc = new Document({
                    sections: [{
                        properties: {},
                        children: [
                            // Title
                            new Paragraph({
                                text: "RFP PROPOSAL",
                                heading: HeadingLevel.TITLE,
                                spacing: { after: 200 }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `Client: ${clientName}`, bold: true }),
                                    new TextRun({ text: `  |  Category: ${category}`, italics: true })
                                ],
                                spacing: { after: 400 }
                            }),
                            
                            // Win Probability
                            new Paragraph({
                                text: "Win Probability Analysis",
                                heading: HeadingLevel.HEADING_1,
                                spacing: { before: 400, after: 200 }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `Win Probability: ${g_analysisData.win_probability}%`, bold: true, size: 32 })
                                ],
                                spacing: { after: 200 }
                            }),
                            new Paragraph({
                                text: g_analysisData.reasoning || 'Analysis completed successfully.',
                                spacing: { after: 400 }
                            }),
                            
                            // Technical Analysis
                            new Paragraph({
                                text: "Technical Analysis",
                                heading: HeadingLevel.HEADING_1,
                                spacing: { before: 400, after: 200 }
                            }),
                            
                            // Create table for technical analysis
                            ...(g_analysisData.technical_analysis || []).map(item => 
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: `• ${item.requirement}: `, bold: true }),
                                        new TextRun({ text: item.our_match }),
                                        new TextRun({ text: ` [${item.status}]`, italics: true })
                                    ],
                                    spacing: { after: 100 }
                                })
                            ),
                            
                            // Email Draft
                            new Paragraph({
                                text: "Proposal Email Draft",
                                heading: HeadingLevel.HEADING_1,
                                spacing: { before: 400, after: 200 }
                            }),
                            new Paragraph({
                                text: g_analysisData.email_draft || 'Email draft not available.',
                                spacing: { after: 200 }
                            }),
                            
                            // Footer
                            new Paragraph({
                                text: `Generated by Diamond Swagger AI on ${new Date().toLocaleDateString()}`,
                                spacing: { before: 600 },
                                alignment: 'center'
                            })
                        ]
                    }]
                });
                
                // Generate and download
                const blob = await Packer.toBlob(doc);
                saveAs(blob, `titans_Proposal_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`);
                
                showToast('✅ Word document downloaded!');
            } catch (error) {
                console.error('DOCX generation error:', error);
                showToast('❌ Error generating Word document. Try PDF instead.');
            }
        }

        // AI Improve Function
        async function improveWithAI() {
            if (!g_analysisData || !g_analysisData.email_draft) {
                showToast('❌ No proposal to improve. Run analysis first.');
                return;
            }
            
            if (!g_apiKey) {
                showToast('❌ Please set your Gemini API key first.');
                return;
            }
            
            showToast('🤖 AI is improving your proposal...');
            
            try {
                const prompt = `Improve this RFP proposal email to be more professional, persuasive, and compelling. Keep the same structure but enhance the language, add stronger value propositions, and make it more likely to win the bid:

${g_analysisData.email_draft}

Return ONLY the improved email text, nothing else.`;

                const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${g_apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
                    })
                });
                
                const data = await response.json();
                const improvedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (improvedText) {
                    g_analysisData.email_draft = improvedText;
                    document.getElementById('finalDocPreview').textContent = improvedText;
                    showToast('✅ Proposal improved by AI!');
                } else {
                    showToast('❌ Could not improve proposal. Try again.');
                }
            } catch (error) {
                console.error('AI improve error:', error);
                showToast('❌ Error improving proposal.');
            }
        }

        // Compliance Checklist Functions
        function showChecklistModal() {
            generateChecklist();
            document.getElementById('checklist-modal').classList.add('active');
        }

        function closeChecklistModal() {
            document.getElementById('checklist-modal').classList.remove('active');
        }

        function generateChecklist() {
            const itemsEl = document.getElementById('checklist-items');
            const emptyEl = document.getElementById('checklist-empty');
            
            if (!g_analysisData || !g_analysisData.technical_analysis) {
                itemsEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }
            
            itemsEl.style.display = 'block';
            emptyEl.style.display = 'none';
            
            const savedChecklist = JSON.parse(localStorage.getItem('titans_checklist') || '{}');
            
            itemsEl.innerHTML = g_analysisData.technical_analysis.map((item, index) => {
                const isCompleted = savedChecklist[index] || false;
                return `
                    <div class="checklist-item ${isCompleted ? 'completed' : ''}" onclick="toggleChecklistItem(${index})">
                        <div class="checklist-checkbox">
                            ${isCompleted ? '<i class="fas fa-check"></i>' : ''}
                        </div>
                        <span class="checklist-text">${item.requirement}</span>
                        <span style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; background: ${item.status === 'Compliant' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}; color: ${item.status === 'Compliant' ? 'var(--accent-green)' : 'var(--accent-orange)'};">
                            ${item.status}
                        </span>
                    </div>
                `;
            }).join('');
            
            updateChecklistProgress();
        }

        function toggleChecklistItem(index) {
            const savedChecklist = JSON.parse(localStorage.getItem('titans_checklist') || '{}');
            savedChecklist[index] = !savedChecklist[index];
            localStorage.setItem('titans_checklist', JSON.stringify(savedChecklist));
            generateChecklist();
        }

        function updateChecklistProgress() {
            if (!g_analysisData || !g_analysisData.technical_analysis) return;
            
            const savedChecklist = JSON.parse(localStorage.getItem('titans_checklist') || '{}');
            const total = g_analysisData.technical_analysis.length;
            const completed = Object.values(savedChecklist).filter(v => v).length;
            
            document.getElementById('checklist-progress').textContent = `${completed}/${total}`;
            document.getElementById('checklist-progress-bar').style.width = `${(completed/total)*100}%`;
        }

        // Keyboard Shortcuts
        function showShortcutsModal() {
            document.getElementById('shortcuts-modal').classList.add('active');
        }

        function closeShortcutsModal() {
            document.getElementById('shortcuts-modal').classList.remove('active');
        }

        // Register keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            const key = e.key.toLowerCase();
            
            // Ctrl + Enter: Run Analysis
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const form = document.getElementById('new-proposal-form');
                if (form && form.style.display !== 'none') {
                    startGeminiAnalysis();
                }
            }
            
            // Ctrl + S: Save Draft
            if (e.ctrlKey && key === 's') {
                e.preventDefault();
                saveDraft();
                showToast('✅ Draft saved!');
            }
            
            // Alt + T: Open Templates
            if (e.altKey && key === 't') {
                e.preventDefault();
                e.stopPropagation();
                showTemplatesModal();
            }
            
            // Alt + H: Open History
            if (e.altKey && key === 'h') {
                e.preventDefault();
                e.stopPropagation();
                showHistoryModal();
            }
            
            // Alt + D: Toggle Dark Mode
            if (e.altKey && key === 'd') {
                e.preventDefault();
                e.stopPropagation();
                toggleTheme();
            }
            
            // Alt + 1: Open Templates (alternative)
            if (e.altKey && e.key === '1') {
                e.preventDefault();
                showTemplatesModal();
            }
            
            // Alt + 2: Open History (alternative)
            if (e.altKey && e.key === '2') {
                e.preventDefault();
                showHistoryModal();
            }
            
            // Ctrl + /: Show Shortcuts
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                showShortcutsModal();
            }
            
            // F1: Show Shortcuts (alternative)
            if (e.key === 'F1') {
                e.preventDefault();
                showShortcutsModal();
            }
            
            // Escape: Close modals
            if (e.key === 'Escape') {
                closeTemplatesModal();
                closeHistoryModal();
                closeChecklistModal();
                closeShortcutsModal();
            }
        });

        // Auto-save functionality
        let autoSaveTimeout = null;

        function setupAutoSave() {
            const inputs = ['clientName', 'rfpCategory', 'rfpText', 'myProductContext'];
            
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', () => {
                        showAutoSaveIndicator('saving');
                        
                        clearTimeout(autoSaveTimeout);
                        autoSaveTimeout = setTimeout(() => {
                            saveDraft();
                            showAutoSaveIndicator('saved');
                        }, 2000);
                    });
                }
            });
        }

        function showAutoSaveIndicator(status) {
            const indicator = document.getElementById('autosave-indicator');
            if (!indicator) return;
            
            indicator.style.display = 'flex';
            indicator.className = 'autosave-indicator ' + status;
            
            const text = document.getElementById('autosave-text');
            const icon = indicator.querySelector('i');
            
            if (status === 'saving') {
                text.textContent = 'Saving...';
                icon.className = 'fas fa-circle-notch fa-spin';
            } else {
                text.textContent = 'Draft saved';
                icon.className = 'fas fa-check';
                setTimeout(() => {
                    indicator.style.display = 'none';
                }, 2000);
            }
        }

        function saveDraft() {
            const draft = {
                clientName: document.getElementById('clientName').value,
                category: document.getElementById('rfpCategory').value,
                rfpText: document.getElementById('rfpText').value,
                productContext: document.getElementById('myProductContext').value,
                savedAt: new Date().toISOString()
            };
            
            localStorage.setItem('titans_draft', JSON.stringify(draft));
        }

        function loadDraft() {
            const draft = JSON.parse(localStorage.getItem('titans_draft') || 'null');
            if (draft) {
                document.getElementById('clientName').value = draft.clientName || '';
                document.getElementById('rfpCategory').value = draft.category || '';
                document.getElementById('rfpText').value = draft.rfpText || '';
                document.getElementById('myProductContext').value = draft.productContext || '';
            }
        }

        // Initialize auto-save on page load
        document.addEventListener('DOMContentLoaded', () => {
            setupAutoSave();
            loadDraft();
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // ============================================
        // COST CALCULATOR FUNCTIONS
        // ============================================
        
        function showCalculatorModal() {
            document.getElementById('calculator-modal').classList.add('active');
            calculatePricing(); // Initial calculation
        }
        
        function closeCalculatorModal() {
            document.getElementById('calculator-modal').classList.remove('active');
        }
        
        function calculatePricing() {
            const baseCost = parseFloat(document.getElementById('calc-base-cost').value) || 0;
            const laborHours = parseFloat(document.getElementById('calc-labor-hours').value) || 0;
            const hourlyRate = parseFloat(document.getElementById('calc-hourly-rate').value) || 0;
            const overheadPct = parseFloat(document.getElementById('calc-overhead').value) || 0;
            const marginPct = parseFloat(document.getElementById('calc-margin').value) || 0;
            const contingencyPct = parseFloat(document.getElementById('calc-contingency').value) || 0;
            
            const laborCost = laborHours * hourlyRate;
            const subtotal = baseCost + laborCost;
            const overhead = subtotal * (overheadPct / 100);
            const contingency = subtotal * (contingencyPct / 100);
            const costBeforeMargin = subtotal + overhead + contingency;
            const profit = costBeforeMargin * (marginPct / 100);
            const total = costBeforeMargin + profit;
            
            document.getElementById('result-base').textContent = formatCurrency(baseCost);
            document.getElementById('result-labor').textContent = formatCurrency(laborCost);
            document.getElementById('result-overhead').textContent = formatCurrency(overhead);
            document.getElementById('result-contingency').textContent = formatCurrency(contingency);
            document.getElementById('result-profit').textContent = formatCurrency(profit);
            document.getElementById('result-total').textContent = formatCurrency(total);
            
            return total;
        }
        
        function submitCalculation() {
            const baseCost = document.getElementById('calc-base-cost').value;
            const laborHours = document.getElementById('calc-labor-hours').value;
            
            if (!baseCost && !laborHours) {
                showToast('⚠️ Please enter at least Base Cost or Labor Hours');
                return;
            }
            
            // Calculate values
            calculatePricing();
            
            // Show results with animation
            const resultsCard = document.getElementById('calc-results');
            const actionButtons = document.getElementById('calc-action-buttons');
            
            // Show the results card
            resultsCard.style.display = 'block';
            actionButtons.style.display = 'flex';
            
            // Trigger animation after a small delay
            setTimeout(() => {
                resultsCard.style.opacity = '1';
                resultsCard.style.transform = 'translateY(0)';
                
                // Animate each row
                const rows = resultsCard.querySelectorAll('.calc-result-row');
                rows.forEach(row => {
                    row.style.opacity = '1';
                    row.style.transform = 'translateX(0)';
                });
                
                // Show action buttons
                setTimeout(() => {
                    actionButtons.style.opacity = '1';
                    actionButtons.style.transform = 'translateY(0)';
                }, 300);
                
                // Auto-scroll to results
                resultsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
            
            showToast('✅ Calculation complete!');
        }
        
        function formatCurrency(amount) {
            return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        
        function resetCalculator() {
            document.getElementById('calc-base-cost').value = '';
            document.getElementById('calc-labor-hours').value = '';
            document.getElementById('calc-hourly-rate').value = '';
            document.getElementById('calc-overhead').value = '';
            document.getElementById('calc-margin').value = '';
            document.getElementById('calc-contingency').value = '';
            
            // Hide results with animation
            const resultsCard = document.getElementById('calc-results');
            const actionButtons = document.getElementById('calc-action-buttons');
            
            resultsCard.style.opacity = '0';
            resultsCard.style.transform = 'translateY(20px)';
            actionButtons.style.opacity = '0';
            actionButtons.style.transform = 'translateY(10px)';
            
            // Reset row animations
            const rows = resultsCard.querySelectorAll('.calc-result-row');
            rows.forEach(row => {
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
            });
            
            setTimeout(() => {
                resultsCard.style.display = 'none';
                actionButtons.style.display = 'none';
            }, 300);
            
            calculatePricing();
            showToast('🔄 Calculator reset');
        }
        
        function copyPricingToProposal() {
            const total = document.getElementById('result-total').textContent;
            const breakdown = `
Pricing Breakdown:
- Base Cost: ${document.getElementById('result-base').textContent}
- Labor Cost: ${document.getElementById('result-labor').textContent}
- Overhead: ${document.getElementById('result-overhead').textContent}
- Contingency: ${document.getElementById('result-contingency').textContent}
- Profit Margin: ${document.getElementById('result-profit').textContent}
- TOTAL BID PRICE: ${total}
            `.trim();
            
            navigator.clipboard.writeText(breakdown).then(() => {
                showToast('✅ Pricing copied to clipboard!');
                closeCalculatorModal();
            });
        }

        // ============================================
        // DEADLINE REMINDERS FUNCTIONS
        // ============================================
        
        function showDeadlinesModal() {
            loadDeadlinesList();
            loadNotificationSettings();
            document.getElementById('deadlines-modal').classList.add('active');
        }
        
        function closeDeadlinesModal() {
            document.getElementById('deadlines-modal').classList.remove('active');
        }
        
        function showAddDeadlineForm() {
            document.getElementById('add-deadline-form').style.display = 'block';
            // Set default date to 2 weeks from now
            const twoWeeks = new Date();
            twoWeeks.setDate(twoWeeks.getDate() + 14);
            document.getElementById('deadline-date').value = twoWeeks.toISOString().split('T')[0];
        }
        
        function hideAddDeadlineForm() {
            document.getElementById('add-deadline-form').style.display = 'none';
            document.getElementById('deadline-project').value = '';
        }
        
        function addDeadline() {
            const project = document.getElementById('deadline-project').value.trim();
            const date = document.getElementById('deadline-date').value;
            
            if (!project || !date) {
                showToast('❌ Please fill in all fields');
                return;
            }
            
            const deadlines = JSON.parse(localStorage.getItem('titans_deadlines') || '[]');
            deadlines.push({
                id: Date.now(),
                project: project,
                date: date,
                createdAt: new Date().toISOString()
            });
            
            localStorage.setItem('titans_deadlines', JSON.stringify(deadlines));
            hideAddDeadlineForm();
            loadDeadlinesList();
            updateDeadlineBadge();
            showToast('✅ Deadline added!');
        }
        
        function deleteDeadline(id) {
            let deadlines = JSON.parse(localStorage.getItem('titans_deadlines') || '[]');
            deadlines = deadlines.filter(d => d.id !== id);
            localStorage.setItem('titans_deadlines', JSON.stringify(deadlines));
            loadDeadlinesList();
            updateDeadlineBadge();
            showToast('🗑️ Deadline removed');
        }
        
        function loadDeadlinesList() {
            const deadlines = JSON.parse(localStorage.getItem('titans_deadlines') || '[]');
            const listEl = document.getElementById('deadlines-list');
            const emptyEl = document.getElementById('deadlines-empty');
            
            if (deadlines.length === 0) {
                listEl.innerHTML = '';
                emptyEl.style.display = 'block';
                return;
            }
            
            emptyEl.style.display = 'none';
            
            // Sort by date
            deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            listEl.innerHTML = deadlines.map(deadline => {
                const daysLeft = getDaysUntil(deadline.date);
                const urgency = daysLeft <= 1 ? 'urgent' : daysLeft <= 3 ? 'warning' : 'normal';
                const daysText = daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Today!' : daysLeft === 1 ? '1 day' : `${daysLeft} days`;
                
                return `
                    <div class="deadline-item ${urgency}">
                        <div class="deadline-icon ${urgency}">
                            <i class="fas fa-${urgency === 'urgent' ? 'exclamation-triangle' : urgency === 'warning' ? 'clock' : 'calendar-check'}"></i>
                        </div>
                        <div class="deadline-info">
                            <h4>${deadline.project}</h4>
                            <p>Due: ${new Date(deadline.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                        <div class="deadline-countdown ${urgency}">
                            <div class="days">${daysLeft < 0 ? '!' : daysLeft}</div>
                            <div class="label">${daysText}</div>
                        </div>
                        <button onclick="deleteDeadline(${deadline.id})" style="background: none; border: none; color: var(--text-medium); cursor: pointer; padding: 0.5rem;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        function getDaysUntil(dateStr) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(dateStr);
            target.setHours(0, 0, 0, 0);
            const diff = target - today;
            return Math.ceil(diff / (1000 * 60 * 60 * 24));
        }
        
        function updateDeadlineBadge() {
            const deadlines = JSON.parse(localStorage.getItem('titans_deadlines') || '[]');
            const urgentCount = deadlines.filter(d => getDaysUntil(d.date) <= 3 && getDaysUntil(d.date) >= 0).length;
            const badge = document.getElementById('deadline-badge');
            
            if (urgentCount > 0) {
                badge.textContent = urgentCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        function requestNotificationPermission() {
            if ('Notification' in window) {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        showToast('✅ Browser notifications enabled!');
                        // Send test notification
                        new Notification('Diamond Swagger RFP', {
                            body: 'Notifications are now enabled! You\'ll be reminded of upcoming deadlines.',
                            icon: 'https://cdn-icons-png.flaticon.com/512/2920/2920277.png'
                        });
                    } else {
                        showToast('❌ Notification permission denied');
                    }
                });
            } else {
                showToast('❌ Browser doesn\'t support notifications');
            }
        }
        
        function saveNotificationSettings() {
            const settings = {
                browser: document.getElementById('notify-browser').checked,
                threeDays: document.getElementById('notify-3days').checked,
                oneDay: document.getElementById('notify-1day').checked
            };
            localStorage.setItem('titans_notification_settings', JSON.stringify(settings));
        }
        
        function loadNotificationSettings() {
            const settings = JSON.parse(localStorage.getItem('titans_notification_settings') || '{"browser":true,"threeDays":true,"oneDay":true}');
            document.getElementById('notify-browser').checked = settings.browser;
            document.getElementById('notify-3days').checked = settings.threeDays;
            document.getElementById('notify-1day').checked = settings.oneDay;
        }
        
        function checkDeadlineReminders() {
            const settings = JSON.parse(localStorage.getItem('titans_notification_settings') || '{"browser":true,"threeDays":true,"oneDay":true}');
            if (!settings.browser || Notification.permission !== 'granted') return;
            
            const deadlines = JSON.parse(localStorage.getItem('titans_deadlines') || '[]');
            const today = new Date().toDateString();
            const notified = JSON.parse(localStorage.getItem('titans_notified_' + today) || '[]');
            
            deadlines.forEach(deadline => {
                const daysLeft = getDaysUntil(deadline.date);
                const notifyKey = `${deadline.id}-${daysLeft}`;
                
                if (notified.includes(notifyKey)) return;
                
                if ((daysLeft === 3 && settings.threeDays) || (daysLeft === 1 && settings.oneDay) || daysLeft === 0) {
                    new Notification('Diamond Swagger RFP Deadline Reminder', {
                        body: `${deadline.project} is due ${daysLeft === 0 ? 'TODAY!' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}`,
                        icon: 'https://cdn-icons-png.flaticon.com/512/2920/2920277.png'
                    });
                    notified.push(notifyKey);
                    localStorage.setItem('titans_notified_' + today, JSON.stringify(notified));
                }
            });
        }
        
        // Initialize deadline features on page load
        document.addEventListener('DOMContentLoaded', () => {
            updateDeadlineBadge();
            updateFavoritesBadge();
            // Check reminders every hour
            checkDeadlineReminders();
            setInterval(checkDeadlineReminders, 3600000);
        });

        // ============================================
        // FAVORITES FUNCTIONS
        // ============================================
        
        function showFavoritesModal() {
            loadFavoritesList();
            document.getElementById('favorites-modal').classList.add('active');
        }
        
        function closeFavoritesModal() {
            document.getElementById('favorites-modal').classList.remove('active');
        }
        
        function toggleFavorite(historyIndex) {
            const history = JSON.parse(localStorage.getItem('titans_proposal_history') || '[]');
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            const item = history[historyIndex];
            
            if (!item) return;
            
            const existingIndex = favorites.findIndex(f => f.savedAt === item.savedAt);
            
            if (existingIndex >= 0) {
                // Remove from favorites
                favorites.splice(existingIndex, 1);
                showToast('⭐ Removed from favorites');
            } else {
                // Add to favorites
                favorites.unshift({
                    ...item,
                    favoritedAt: new Date().toISOString()
                });
                showToast('⭐ Added to favorites!');
            }
            
            localStorage.setItem('titans_favorites', JSON.stringify(favorites));
            loadHistoryList();
            updateFavoritesBadge();
        }
        
        function loadFavoritesList() {
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            const listEl = document.getElementById('favorites-list');
            const emptyEl = document.getElementById('favorites-empty');
            
            if (favorites.length === 0) {
                listEl.innerHTML = '';
                emptyEl.style.display = 'block';
                return;
            }
            
            emptyEl.style.display = 'none';
            
            listEl.innerHTML = favorites.map((item, index) => `
                <div class="favorite-item" onclick="loadFromFavorite(${index})">
                    <div class="favorite-star">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="favorite-info">
                        <h4>${item.clientName || 'Untitled Proposal'}</h4>
                        <p>${item.category || 'No category'}</p>
                        <div class="favorite-meta">
                            <span><i class="fas fa-trophy"></i> ${item.winProbability || '--'}% Win</span>
                            <span><i class="fas fa-calendar"></i> ${new Date(item.savedAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="favorite-actions">
                        <button onclick="event.stopPropagation(); loadFromFavorite(${index})" title="Load">
                            <i class="fas fa-folder-open"></i>
                        </button>
                        <button onclick="event.stopPropagation(); removeFromFavorites(${index})" title="Remove" class="delete">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        function loadFromFavorite(index) {
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            const item = favorites[index];
            
            if (item) {
                document.getElementById('clientName').value = item.clientName || '';
                document.getElementById('rfpCategory').value = item.category || '';
                document.getElementById('rfpText').value = item.rfpText || '';
                document.getElementById('myProductContext').value = item.productContext || '';
                g_analysisData = item.analysisData;
                
                closeFavoritesModal();
                showNewProposalForm();
                
                if (g_analysisData) {
                    displayResults(g_analysisData);
                }
                
                showToast('⭐ Loaded favorite proposal');
            }
        }
        
        function removeFromFavorites(index) {
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            favorites.splice(index, 1);
            localStorage.setItem('titans_favorites', JSON.stringify(favorites));
            loadFavoritesList();
            loadHistoryList();
            updateFavoritesBadge();
            showToast('⭐ Removed from favorites');
        }
        
        function updateFavoritesBadge() {
            const favorites = JSON.parse(localStorage.getItem('titans_favorites') || '[]');
            const badge = document.getElementById('favorites-badge');
            
            if (favorites.length > 0) {
                badge.textContent = favorites.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        // ============================================
        // DRAG & DROP FILE UPLOAD FUNCTIONS
        // ============================================
        
        let uploadedFileData = null;
        
        function initDragAndDrop() {
            const dropZone = document.getElementById('dropZone');
            if (!dropZone) return;
            
            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
                document.body.addEventListener(eventName, preventDefaults, false);
            });
            
            // Highlight drop zone when dragging over it
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('drag-over');
                }, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('drag-over');
                }, false);
            });
            
            // Handle dropped files
            dropZone.addEventListener('drop', handleDrop, false);
        }
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0) {
                handleFile(files[0]);
            }
        }
        
        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                handleFile(file);
            }
        }
        
        function handleFile(file) {
            const validTypes = [
                'text/plain',
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/rtf',
                'text/rtf'
            ];
            
            const validExtensions = ['.txt', '.pdf', '.doc', '.docx', '.rtf'];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            
            if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
                showToast('❌ Unsupported file type. Please use TXT, PDF, DOC, or DOCX files.');
                return;
            }
            
            // Show file info
            const fileInfoBar = document.getElementById('fileInfoBar');
            document.getElementById('uploadedFileName').textContent = file.name;
            document.getElementById('uploadedFileSize').textContent = formatFileSize(file.size);
            fileInfoBar.classList.add('show');
            
            uploadedFileData = file;
            
            // Read file content based on type
            if (file.type === 'text/plain' || fileExtension === '.txt') {
                readTextFile(file);
            } else if (file.type === 'application/pdf' || fileExtension === '.pdf') {
                readPdfFile(file);
            } else if (fileExtension === '.doc' || fileExtension === '.docx') {
                readDocFile(file);
            } else {
                // Try to read as text
                readTextFile(file);
            }
        }
        
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function readTextFile(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                document.getElementById('rfpText').value = content;
                showToast('✅ File loaded: ' + file.name);
            };
            reader.onerror = function() {
                showToast('❌ Error reading file');
            };
            reader.readAsText(file);
        }
        
        async function readPdfFile(file) {
            showToast('📄 Processing PDF file...');
            
            // Check if PDF.js is loaded
            if (typeof pdfjsLib === 'undefined') {
                // Load PDF.js dynamically
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    extractPdfText(file);
                };
                script.onerror = () => {
                    showToast('❌ Could not load PDF reader. Please copy text manually.');
                    document.getElementById('rfpText').value = '[PDF file uploaded: ' + file.name + ']\n\nPlease copy and paste the PDF content here, or use a TXT file.';
                };
                document.head.appendChild(script);
            } else {
                extractPdfText(file);
            }
        }
        
        async function extractPdfText(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n\n';
                }
                
                document.getElementById('rfpText').value = fullText.trim();
                showToast('✅ PDF loaded: ' + file.name + ' (' + pdf.numPages + ' pages)');
            } catch (error) {
                console.error('PDF extraction error:', error);
                showToast('❌ Error reading PDF. Please try a different file.');
                document.getElementById('rfpText').value = '[PDF file: ' + file.name + ']\n\nCould not extract text. Please copy and paste the content manually.';
            }
        }
        
        async function readDocFile(file) {
            showToast('📄 Processing Word document...');
            
            // Check if mammoth.js is loaded
            if (typeof mammoth === 'undefined') {
                // Load mammoth.js dynamically
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
                script.onload = () => {
                    extractDocText(file);
                };
                script.onerror = () => {
                    showToast('❌ Could not load Word reader. Please copy text manually.');
                    document.getElementById('rfpText').value = '[Word file uploaded: ' + file.name + ']\n\nPlease copy and paste the document content here, or use a TXT file.';
                };
                document.head.appendChild(script);
            } else {
                extractDocText(file);
            }
        }
        
        async function extractDocText(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                document.getElementById('rfpText').value = result.value;
                showToast('✅ Document loaded: ' + file.name);
            } catch (error) {
                console.error('DOC extraction error:', error);
                showToast('❌ Error reading document. Please try a different file.');
                document.getElementById('rfpText').value = '[Word file: ' + file.name + ']\n\nCould not extract text. Please copy and paste the content manually.';
            }
        }
        
        function clearUploadedFile() {
            uploadedFileData = null;
            document.getElementById('fileInfoBar').classList.remove('show');
            document.getElementById('fileUploadInput').value = '';
            document.getElementById('rfpText').value = '';
            showToast('🗑️ File removed');
        }
        
        // Initialize drag and drop on page load
        document.addEventListener('DOMContentLoaded', () => {
            initDragAndDrop();
        });
