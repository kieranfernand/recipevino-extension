document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    chrome.storage.local.get(['age_verified', 'free_scans_remaining'], (data) => {
        if (data.age_verified) {
            const scansLeft = data.free_scans_remaining ?? 0;
            if (scansLeft > 0) {
                setupMainAppState(scansLeft);
            } else {
                setupSubscriptionState();
            }
        } else {
            setupAgeGateState();
        }
    });
}

function setUIState(stateClassName) {
    document.getElementById('popup').className = stateClassName;
}

function setupAgeGateState() {
    setUIState('age-gate-state');
    const continueBtn = document.getElementById('continue-btn');
    const dayInput = document.getElementById('dob-day');
    const monthInput = document.getElementById('dob-month');
    const yearInput = document.getElementById('dob-year');
    const legalCheckbox = document.getElementById('legal-agree');
    const errorMessage = document.getElementById('age-gate-error');

    const validate = () => {
        errorMessage.textContent = "";
        const day = parseInt(dayInput.value, 10);
        const month = parseInt(monthInput.value, 10);
        const year = parseInt(yearInput.value, 10);

        if (!dayInput.value || !monthInput.value || yearInput.value.length < 4) {
            continueBtn.disabled = true;
            return;
        }

        const birthDate = new Date(year, month - 1, day);
        if (isNaN(birthDate.getTime())) { // Invalid date
            continueBtn.disabled = true;
            return;
        }

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        const isAgeValid = age >= 21;
        const isChecked = legalCheckbox.checked;
        continueBtn.disabled = !isAgeValid || !isChecked;
        
        if (!isAgeValid) {
             errorMessage.textContent = "You must be at least 21 years old.";
        }
    };

    [dayInput, monthInput, yearInput, legalCheckbox].forEach(el => {
        el.addEventListener('input', validate);
    });
    
    continueBtn.addEventListener('click', () => {
        chrome.storage.local.set({ age_verified: true, free_scans_remaining: 3 }, () => {
            setupWelcomeState();
        });
    });
}

function setupWelcomeState() {
    setUIState('welcome-state');
    document.getElementById('start-pairing-btn').addEventListener('click', () => {
        initializeApp();
    });
}

function setupMainAppState(scansLeft) {
    setUIState('initial-state');
    setRandomTagline();
    document.getElementById('scan-counter-display').textContent = `${scansLeft} scan${scansLeft !== 1 ? 's' : ''} remaining.`;
    document.getElementById('findPairingBtn').addEventListener('click', startScraping);
}

function setupSuccessState(pairing, ingredients) {
    setUIState('success-state');
    setRandomSommelierTitle();
    document.getElementById('wine-suggestion').textContent = pairing.wineName;
    document.getElementById('wine-description').textContent = `"${pairing.description}"`;
    
    const list = document.getElementById('ingredient-list');
    list.innerHTML = '';
    ingredients.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
    });

    document.getElementById('rescanBtn').addEventListener('click', initializeApp);
}

function setupErrorState(message = "Could not find a valid recipe on this page.") {
    setUIState('error-state');
    document.getElementById('error-message-text').textContent = message;
    document.getElementById('tryAgainBtn').addEventListener('click', initializeApp);
}

function setupSubscriptionState() {
    setUIState('subscribe-state');
    document.getElementById('subscribe-btn').addEventListener('click', () => {
        console.log("Initiating subscription flow...");
    });
}

function startScraping() {
    setUIState('loading-state');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: scrapeRecipeOnPage,
            }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults?.[0]?.result) {
                    setupErrorState("Failed to inject scraping script.");
                    return;
                }
                
                chrome.storage.local.get('free_scans_remaining', (data) => {
                    const newCount = Math.max(0, (data.free_scans_remaining || 0) - 1);
                    chrome.storage.local.set({ free_scans_remaining: newCount });
                    callApi(injectionResults[0].result);
                });
            });
        } else {
            setupErrorState("Could not find an active tab.");
        }
    });
}

async function callApi(recipeData) {
    if (!recipeData || recipeData.error || !recipeData.ingredients || recipeData.ingredients.length === 0) {
        setupErrorState();
        return;
    }

    try {
        const apiUrl = 'https://recipevino-backend.vercel.app/api/get-pairing';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipeTitle: recipeData.title,
                ingredients: recipeData.ingredients
            }),
        });

        if (!response.ok) throw new Error(`API server returned status ${response.status}`);
        
        const pairing = await response.json();
        if (pairing.error) throw new Error(`API Error: ${pairing.error}`);

        setupSuccessState(pairing, recipeData.ingredients);

    } catch (error) {
        console.error("API call failed:", error);
        setupErrorState(error.message);
    }
}

function setRandomSommelierTitle() {
    const titles = ["A Note From Your Sommelier", "A Pairing Suggestion", "Your Recommended Wine", "The Perfect Pour", "A Sommelier's Choice"];
    const titleEl = document.getElementById("sommelier-title");
    if (titleEl) titleEl.textContent = titles[Math.floor(Math.random() * titles.length)];
}

function setRandomTagline() {
    const taglines = ["The perfect pour for every plate.", "Uncork the magic.", "Pair it like a pro."];
    const taglineEl = document.getElementById("tagline");
    if (taglineEl) taglineEl.textContent = taglines[Math.floor(Math.random() * taglines.length)];
}

function scrapeRecipeOnPage() {
    try {
        function getTitle() {
            const h1 = document.querySelector('h1');
            if (h1) return h1.innerText.trim();
            return document.title;
        }
        function scrapeFromJSONLD() {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    const graph = data['@graph'] || [data];
                    for (const item of graph) {
                        if (item['@type']?.includes('Recipe') || item['recipeIngredient']) {
                            if (Array.isArray(item.recipeIngredient)) {
                                return item.recipeIngredient.map(ing => ing.replace(/\s+/g, ' ').trim());
                            }
                        }
                    }
                } catch (e) {}
            }
            return null;
        }
        function scrapeFromAttributes() {
            const elements = document.querySelectorAll('[itemprop="recipeIngredient"]');
            if (elements.length > 0) {
                const ingredients = [];
                elements.forEach(el => {
                    const text = el.innerText.trim();
                    if (text) ingredients.push(text);
                });
                return ingredients;
            }
            return null;
        }
        function scrapeFromCSS() {
            const siteConfigs = { "allrecipes.com": ".mm-recipes-structured-ingredients__list-item p", "foodnetwork.com": ".o-Ingredients__a-Ingredient", "bbcgoodfood.com": ".recipe__ingredients ul li", "tasty.co": ".ingredient", "seriouseats.com": ".ingredient-list li", "simplyrecipes.com": ".structured-ingredients__list-item", "smittenkitchen.com": ".smittenkitchen-ingredient", "budgetbytes.com": ".wprm-recipe-ingredient", "thekitchn.com": ".Recipe__ingredient", "bonappetit.com": '[data-testid="IngredientList"] p', "pinchofyum.com": ".tasty-recipes-ingredients-body li", "food52.com": ".recipe__list-item" };
            const hostname = window.location.hostname;
            let selector = null;
            for (const site in siteConfigs) {
                if (hostname.includes(site)) {
                    selector = siteConfigs[site];
                    break;
                }
            }
            if (!selector) return null;
            const ingredients = [];
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText.trim();
                if (text) ingredients.push(text);
            });
            return ingredients.length > 0 ? [...new Set(ingredients)] : null;
        }
        const ingredients = scrapeFromJSONLD() || scrapeFromAttributes() || scrapeFromCSS();
        const title = getTitle();
        return { title, ingredients: ingredients || [] };
    } catch (e) {
        return { error: e.toString() };
    }
}