const FAVORITES_KEY = "favorites";
const CUSTOM_NAMES_KEY = "customNames";

let modalMode = "add-favorite";
let editingTarget = null;
let openMenu = null;
let draggedFavoriteIndex = null;

function $(id) {
    return document.getElementById(id);
}

async function getFavorites() {
    const result = await chrome.storage.local.get(FAVORITES_KEY);
    return result[FAVORITES_KEY] ?? [
        { name: "Gmail", url: "https://mail.google.com/" },
        { name: "YouTube", url: "https://www.youtube.com/" },
        { name: "GitHub", url: "https://github.com/" }
    ];
}

async function saveFavorites(favorites) {
    await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
}

async function getCustomNames() {
    const result = await chrome.storage.local.get(CUSTOM_NAMES_KEY);
    return result[CUSTOM_NAMES_KEY] ?? {};
}

async function saveCustomNames(customNames) {
    await chrome.storage.local.set({ [CUSTOM_NAMES_KEY]: customNames });
}

function normalizeUrl(input) {
    let url = input.trim();
    if (!url) {
        throw new Error("Please enter a website URL.");
    }

    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }

    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http and https URLs are supported.");
    }

    return parsed.toString();
}

function deriveDisplayName(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function closeOpenMenu() {
    if (!openMenu) return;
    openMenu.menu.classList.remove("open");
    openMenu.trigger.classList.remove("open");
    openMenu = null;
}

function toggleMenu(menu, trigger) {
    const isOpen = menu.classList.contains("open");
    closeOpenMenu();

    if (!isOpen) {
        menu.classList.add("open");
        trigger.classList.add("open");
        openMenu = { menu, trigger };
    }
}

function makeCard(item, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";

    const a = document.createElement("a");
    a.className = "card";
    a.href = item.url;
    a.innerHTML = `
        <div class="title"></div>
        <div class="url"></div>
    `;
    a.querySelector(".title").textContent = item.name || item.title || item.url;
    a.querySelector(".url").textContent = item.url;

    const trigger = document.createElement("button");
    trigger.className = "card-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Open site menu");

    const menu = document.createElement("div");
    menu.className = "card-menu";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();
        closeOpenMenu();
        openRenameModal(options.renameTarget);
    });
    menu.appendChild(renameBtn);

    if (options.canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            event.preventDefault();
            closeOpenMenu();
            await removeFavorite(options.removeIndex);
        });
        menu.appendChild(removeBtn);
    }

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(menu, trigger);
    });

    wrap.appendChild(a);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    return wrap;
}

function makeAddCard() {
    const button = document.createElement("button");
    button.className = "card add-card";
    button.type = "button";
    button.innerHTML = `
        <div class="plus">+</div>
        <div class="label">Add New</div>
        <div class="subtext">Pin a favorite site</div>
    `;
    button.addEventListener("click", openAddFavoriteModal);
    return button;
}

async function renderFavorites() {
    const container = $("favorites");
    container.innerHTML = "";

    const favorites = await getFavorites();

    for (const [index, fav] of favorites.entries()) {
        container.appendChild(
            makeCard(fav, {
                isFavorite: true,
                favoriteIndex: index,
                canRemove: true,
                removeIndex: index,
                renameTarget: {
                    type: "favorite",
                    index,
                    url: fav.url,
                    currentName: fav.name || deriveDisplayName(fav.url)
                }
            })
        );
    }

    container.appendChild(makeAddCard());
}

async function renderTopSites() {
    const container = $("topSites");
    container.innerHTML = "";

    try {
        const [sites, customNames, favorites] = await Promise.all([
            chrome.topSites.get(),
            getCustomNames(),
            getFavorites()
        ]);

        const favoriteUrls = new Set(favorites.map((fav) => fav.url));

        if (!sites.length) {
            container.innerHTML = `<div class="empty">No top sites available.</div>`;
            return;
        }

        for (const site of sites.slice(0, 12)) {
            const displayName =
                customNames[site.url] ||
                site.title ||
                deriveDisplayName(site.url);

            const alreadyFavorited = favoriteUrls.has(site.url);

            container.appendChild(
                makeCard(
                    {
                        name: displayName,
                        url: site.url
                    },
                    {
                        isFavorite: false,
                        canFavorite: true,
                        alreadyFavorited,
                        showFavoriteBadge: alreadyFavorited,
                        favoriteTarget: {
                            name: displayName,
                            url: site.url
                        },
                        canRemove: false,
                        renameTarget: {
                            type: "top-site",
                            url: site.url,
                            currentName: displayName
                        }
                    }
                )
            );
        }
    } catch (err) {
        container.innerHTML = `<div class="empty">Could not load top sites.</div>`;
        console.error(err);
    }
}

function openFavoriteModalBase({
    title,
    description,
    saveLabel,
    mode,
    target = null,
    url = "",
    name = "",
    lockUrl = false
}) {
    modalMode = mode;
    editingTarget = target;

    $("favoriteModalTitle").textContent = title;
    $("favoriteModalDescription").textContent = description;
    $("saveFavoriteBtn").textContent = saveLabel;
    $("favoriteError").textContent = "";

    $("favoriteUrl").value = url;
    $("favoriteName").value = name;
    $("favoriteUrl").disabled = lockUrl;

    $("favoriteModal").classList.add("open");
    $("favoriteModal").setAttribute("aria-hidden", "false");

    if (lockUrl) {
        $("favoriteName").focus();
        $("favoriteName").select();
    } else {
        $("favoriteUrl").focus();
    }
}

function openAddFavoriteModal() {
    $("favoriteForm").reset();
    openFavoriteModalBase({
        title: "Add Favorite",
        description: "Enter a website URL and, if you want, a custom display name.",
        saveLabel: "Save",
        mode: "add-favorite",
        target: null,
        url: "",
        name: "",
        lockUrl: false
    });
}

function openRenameModal(target) {
    openFavoriteModalBase({
        title: "Rename Site",
        description: "Choose the name you want this site to display on your start page.",
        saveLabel: "Save",
        mode: "rename-site",
        target,
        url: target.url,
        name: target.currentName || "",
        lockUrl: true
    });
}

function closeFavoriteModal() {
    $("favoriteModal").classList.remove("open");
    $("favoriteModal").setAttribute("aria-hidden", "true");
    $("favoriteError").textContent = "";
    $("favoriteUrl").disabled = false;
    editingTarget = null;
}

async function removeFavorite(index) {
    const favorites = await getFavorites();
    favorites.splice(index, 1);
    await saveFavorites(favorites);
    await renderFavorites();
    await renderTopSites();
}

async function handleFavoriteSubmit(event) {
    event.preventDefault();

    const errorEl = $("favoriteError");
    errorEl.textContent = "";

    try {
        if (modalMode === "add-favorite") {
            const rawUrl = $("favoriteUrl").value;
            const rawName = $("favoriteName").value.trim();

            const normalizedUrl = normalizeUrl(rawUrl);
            const derivedName = deriveDisplayName(normalizedUrl);
            const finalName = rawName || derivedName;

            const favorites = await getFavorites();
            favorites.push({
                name: finalName,
                url: normalizedUrl
            });

            await saveFavorites(favorites);
            closeFavoriteModal();
            await renderFavorites();
            return;
        }

        if (modalMode === "rename-site") {
            const rawName = $("favoriteName").value.trim();

            if (!editingTarget) {
                throw new Error("Nothing selected to rename.");
            }

            const finalName = rawName || deriveDisplayName(editingTarget.url);

            if (editingTarget.type === "favorite") {
                const favorites = await getFavorites();
                if (!favorites[editingTarget.index]) {
                    throw new Error("That favorite no longer exists.");
                }

                favorites[editingTarget.index] = {
                    ...favorites[editingTarget.index],
                    name: finalName
                };

                await saveFavorites(favorites);
                closeFavoriteModal();
                await renderFavorites();
                return;
            }

            if (editingTarget.type === "top-site") {
                const customNames = await getCustomNames();
                customNames[editingTarget.url] = finalName;
                await saveCustomNames(customNames);
                closeFavoriteModal();
                await renderTopSites();
                return;
            }
        }

        throw new Error("Unsupported action.");
    } catch (error) {
        errorEl.textContent = error.message || "Could not save changes.";
    }
}

async function moveFavorite(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;

    const favorites = await getFavorites();

    if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= favorites.length ||
        toIndex >= favorites.length
    ) {
        return;
    }

    const [moved] = favorites.splice(fromIndex, 1);
    favorites.splice(toIndex, 0, moved);

    await saveFavorites(favorites);
    await renderFavorites();
}

function clearFavoriteDragState() {
    draggedFavoriteIndex = null;
    document.querySelectorAll(".card-wrap.dragging, .card-wrap.drag-over").forEach((el) => {
        el.classList.remove("dragging", "drag-over");
    });
}

async function addSiteToFavorites(target) {
    if (!target?.url) return;

    const favorites = await getFavorites();

    const alreadyExists = favorites.some((fav) => fav.url === target.url);
    if (alreadyExists) {
        return;
    }

    favorites.push({
        name: target.name || deriveDisplayName(target.url),
        url: target.url
    });

    await saveFavorites(favorites);
    await renderFavorites();
    await renderTopSites();
}

function getHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function getExtensionFaviconUrl(pageUrl, size = 32) {
    const encodedPageUrl = encodeURIComponent(pageUrl);
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodedPageUrl}&size=${size}`;
}

function getFallbackFaviconUrl(pageUrl) {
    try {
        const parsed = new URL(pageUrl);
        return `${parsed.origin}/favicon.ico`;
    } catch {
        return "";
    }
}

function makeCard(item, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";

    const a = document.createElement("a");
    a.className = "card";
    a.href = item.url;

    if (options.isFavorite) {
        a.draggable = true;
    }

    const hostname = getHostname(item.url);

    a.innerHTML = `
    <div class="card-head">
      <img class="card-favicon" alt="" />
      <div class="title"></div>
    </div>
    <div class="card-body">
      <div class="url"></div>
    </div>
  `;

    a.querySelector(".title").textContent = item.name || item.title || hostname;
    a.querySelector(".url").textContent = item.url;

    const favicon = a.querySelector(".card-favicon");
    const sources = [
        getExtensionFaviconUrl(item.url, 32),
        getFallbackFaviconUrl(item.url)
    ];

    let sourceIndex = 0;

    function tryNextFavicon() {
        if (sourceIndex >= sources.length) {
            favicon.style.display = "none";
            return;
        }

        favicon.src = sources[sourceIndex++];
    }

    favicon.addEventListener("error", tryNextFavicon);
    tryNextFavicon();

    if (options.showFavoriteBadge) {
        const badge = document.createElement("div");
        badge.className = "favorite-badge";
        badge.textContent = "Favorited";
        wrap.appendChild(badge);
    }

    if (options.isFavorite) {
        a.addEventListener("dragstart", (event) => {
            draggedFavoriteIndex = options.favoriteIndex;
            wrap.classList.add("dragging");
            closeOpenMenu();

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(options.favoriteIndex));
            }
        });

        a.addEventListener("dragend", () => {
            clearFavoriteDragState();
        });

        wrap.addEventListener("dragover", (event) => {
            if (draggedFavoriteIndex == null || draggedFavoriteIndex === options.favoriteIndex) {
                return;
            }

            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            wrap.classList.add("drag-over");
        });

        wrap.addEventListener("dragleave", (event) => {
            if (!wrap.contains(event.relatedTarget)) {
                wrap.classList.remove("drag-over");
            }
        });

        wrap.addEventListener("drop", async (event) => {
            event.preventDefault();
            wrap.classList.remove("drag-over");

            const fromIndex = draggedFavoriteIndex;
            const toIndex = options.favoriteIndex;

            clearFavoriteDragState();
            await moveFavorite(fromIndex, toIndex);
        });
    }

    const trigger = document.createElement("button");
    trigger.className = "card-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Open site menu");

    const menu = document.createElement("div");
    menu.className = "card-menu";

    if (options.canFavorite) {
        const favoriteBtn = document.createElement("button");
        favoriteBtn.type = "button";

        if (options.alreadyFavorited) {
            favoriteBtn.textContent = "Already in Favorites";
            favoriteBtn.disabled = true;
            favoriteBtn.style.opacity = "0.6";
            favoriteBtn.style.cursor = "default";
        } else {
            favoriteBtn.textContent = "Add to Favorites";
            favoriteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                event.preventDefault();
                closeOpenMenu();
                await addSiteToFavorites(options.favoriteTarget);
            });
        }

        menu.appendChild(favoriteBtn);
    }

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();
        closeOpenMenu();
        openRenameModal(options.renameTarget);
    });
    menu.appendChild(renameBtn);

    if (options.canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            event.preventDefault();
            closeOpenMenu();
            await removeFavorite(options.removeIndex);
        });
        menu.appendChild(removeBtn);
    }

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(menu, trigger);
    });

    wrap.appendChild(a);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    return wrap;
}

$("favoriteForm").addEventListener("submit", handleFavoriteSubmit);
$("cancelFavoriteBtn").addEventListener("click", closeFavoriteModal);

$("favoriteModal").addEventListener("click", (event) => {
    if (event.target === $("favoriteModal")) {
        closeFavoriteModal();
    }
});

document.addEventListener("click", (event) => {
    if (!openMenu) return;

    const clickedInsideMenu = openMenu.menu.contains(event.target);
    const clickedTrigger = openMenu.trigger.contains(event.target);

    if (!clickedInsideMenu && !clickedTrigger) {
        closeOpenMenu();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if ($("favoriteModal").classList.contains("open")) {
            closeFavoriteModal();
            return;
        }

        closeOpenMenu();
    }
});

$("favoriteUrl").addEventListener("blur", () => {
    if (modalMode !== "add-favorite") return;

    const urlValue = $("favoriteUrl").value.trim();
    const nameInput = $("favoriteName");

    if (!urlValue || nameInput.value.trim()) return;

    try {
        const normalizedUrl = normalizeUrl(urlValue);
        nameInput.value = deriveDisplayName(normalizedUrl);
    } catch {
        // Ignore invalid URL while typing
    }
});

renderFavorites();
renderTopSites();