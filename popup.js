document.addEventListener('DOMContentLoaded', () => {
    const findPairingBtn = document.getElementById('findPairingBtn');
    const rescanBtn = document.getElementById('rescanBtn');
    const tryAgainBtn = document.getElementById('tryAgainBtn');

    if (findPairingBtn) findPairingBtn.addEventListener('click', startScraping);
    if (rescanBtn) rescanBtn.addEventListener('click', () => setUIState('initial'));
    if (tryAgainBtn) tryAgainBtn.addEventListener('click', () => setUIState('initial'));

    setRandomTagline();
    setUIState('initial');
});

function setUIState(state) {
    document.getElementById('popup').className = state;
}

function startScraping() {
    setUIState('loading');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: scrapeRecipeOnPage,
            }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || !injectionResults.length) {
                    handleScrapingResponse({ error: "Injection failed." });
                    return;
                }
                handleScrapingResponse(injectionResults[0].result);
            });
        } else {
            handleScrapingResponse({ error: "Could not find active tab." });
        }
    });
}

function handleScrapingResponse(response) {
    if (!response || response.error || !response.ingredients) {
        setUIState('error');
        return;
    }
    const ingredients = response.ingredients;
    if (ingredients && ingredients.length > 0) {
        const pairing = getWinePairing(ingredients);
        
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
        setUIState('success');
    } else {
        setUIState('error');
    }
}

function getWinePairing(ingredients) {
    const ingredientString = ingredients.join(' ').toLowerCase();
    if (ingredientString.includes('beef') || ingredientString.includes('lamb')) return { wineName: "Cabernet Sauvignon", description: "A bold red like Cabernet Sauvignon stands up well to the rich, savory flavors of red meat dishes." };
    if (ingredientString.includes('chicken') || ingredientString.includes('turkey')) return { wineName: "Chardonnay", description: "An oaked Chardonnay offers a creamy texture and buttery notes that complement poultry beautifully." };
    if (ingredientString.includes('pork')) return { wineName: "Pinot Noir", description: "The earthy notes and bright acidity of Pinot Noir cut through the richness of pork without overpowering it." };
    if (ingredientString.includes('salmon') || ingredientString.includes('tuna')) return { wineName: "Rosé", description: "A dry Rosé provides the perfect balance of fruity freshness and acidity for rich, oily fish." };
    return { wineName: "Sauvignon Blanc", description: "This versatile white wine offers crisp, herbal notes that pair well with a wide variety of lighter dishes." };
}

function setRandomSommelierTitle() {
    const titles = ["A Note From Your Sommelier", "A Pairing Suggestion", "Your Recommended Wine", "The Perfect Pour", "A Sommelier's Choice"];
    const titleEl = document.getElementById("sommelier-title");
    if (titleEl) {
        titleEl.textContent = titles[Math.floor(Math.random() * titles.length)];
    }
}

function setRandomTagline() {
    const taglines = ["The perfect pour for every plate.", "Uncork the magic.", "Pair it like a pro."];
    const taglineEl = document.getElementById("tagline");
    if (taglineEl) {
        taglineEl.textContent = taglines[Math.floor(Math.random() * taglines.length)];
    }
}

function scrapeRecipeOnPage() {
    try {
        function scrapeFromJSONLD() {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    const graph = data['@graph'] || [data];
                    for (const item of graph) {
                        if (item['@type'] && (item['@type'].includes('Recipe') || item['recipeIngredient'])) {
                            if (Array.isArray(item.recipeIngredient)) {
                                return item.recipeIngredient.map(ing => ing.replace(/\s+/g, ' ').trim());
                            }
                        }
                    }
                } catch (e) { /* Ignore */ }
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
        return { ingredients: ingredients || [] };

    } catch (e) {
        return { error: e.toString() };
    }
}