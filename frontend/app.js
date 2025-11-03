const API_BASE = '/api';
const LOCATION_LABELS = {
    studierendenhaus: 'Schweinemensa',
    blattwerk: 'Blattwerk',
    philturm: 'Philturm'
};
const ALL_LOCATIONS_KEY = 'all';
const OPENING_TIMES_DEFAULT = 'OPENING TIMES vary by location';

let currentLocation = 'all';
let currentSort = 'upvotes';
let currentMeals = [];
let emptyMealsMessage = 'No meals available for today.';
let selectedTag = null; // Track the currently selected tag filter

// DOM Elements
const locationSelect = document.getElementById('location-select');
const refreshBtn = document.getElementById('refresh-btn');
const mealsContainer = document.getElementById('meals-container');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const sortSelect = document.getElementById('sort-select');
const openingTimesEl = document.getElementById('opening-times');
const subtitleEl = document.querySelector('.subtitle');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (locationSelect) {
        locationSelect.value = currentLocation;
    }
    updateOpeningTimes(currentLocation);
    loadMeals();

    if (locationSelect) {
        locationSelect.addEventListener('change', (e) => {
            currentLocation = e.target.value;
            selectedTag = null; // Clear tag filter when changing location
            updateOpeningTimes(currentLocation);
            loadMeals();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadMeals();
        });
    }

    if (sortSelect) {
        currentSort = sortSelect.value;
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderMeals();
        });
    }
});

function updateSubtitleWithDate(dateString) {
    if (!subtitleEl) return;

    try {
        const date = new Date(dateString + 'T12:00:00'); // Add time to avoid timezone issues
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formatted = date.toLocaleDateString('de-DE', options);
        subtitleEl.textContent = `Rate meals for ${formatted}`;
    } catch (error) {
        console.error('Error formatting date:', error);
        subtitleEl.textContent = 'Rate today\'s meals';
    }
}

async function updateOpeningTimes(location) {
    if (!openingTimesEl) return;

    if (location === ALL_LOCATIONS_KEY) {
        openingTimesEl.textContent = '';
        openingTimesEl.style.display = 'none';
        return;
    }

    openingTimesEl.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE}/meals/opening-times/${location}`);
        if (response.ok) {
            const data = await response.json();
            if (data.openingTimes) {
                openingTimesEl.textContent = data.openingTimes;
            } else {
                openingTimesEl.textContent = OPENING_TIMES_DEFAULT;
            }
        } else {
            openingTimesEl.textContent = OPENING_TIMES_DEFAULT;
        }
    } catch (error) {
        console.error('Error fetching opening times:', error);
        openingTimesEl.textContent = OPENING_TIMES_DEFAULT;
    }
}

// Load meals from API
async function loadMeals() {
    showLoading();
    hideError();

    try {
        const response = await fetch(`${API_BASE}/meals/today?location=${currentLocation}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data && typeof data.location === 'string') {
            currentLocation = data.location;
            if (locationSelect) {
                locationSelect.value = currentLocation;
            }
            updateOpeningTimes(currentLocation);
        }

        if (data.message) {
            if (subtitleEl) {
                subtitleEl.textContent = data.message;
            }
        } else if (data.meals && data.meals.length > 0 && data.meals[0].date) {
            updateSubtitleWithDate(data.meals[0].date);
        } else if (subtitleEl) {
            subtitleEl.textContent = 'Rate today\'s meals';
        }

        displayMeals(data.meals, data.message);
        hideLoading();
    } catch (error) {
        console.error('Error loading meals:', error);
        showError('Failed to load meals. Please try again.');
        hideLoading();
    }
}

// Display meals in a single minimalist list
function displayMeals(meals, message) {
    emptyMealsMessage = typeof message === 'string' && message.trim().length > 0
        ? message.trim()
        : 'No meals available for today.';

    currentMeals = Array.isArray(meals)
        ? meals.map((meal, index) => ({ ...meal, _originalIndex: index }))
        : [];
    renderMeals();
}

function renderMeals() {
    if (!currentMeals.length) {
        mealsContainer.innerHTML = `<div class="meal-card"><p>${escapeHtml(emptyMealsMessage)}</p></div>`;
        updateTagFilterBar();
        return;
    }

    // Update the tag filter bar with available tags
    updateTagFilterBar();

    // Filter meals by selected tag if active
    let mealsToDisplay = currentMeals;
    if (selectedTag) {
        mealsToDisplay = currentMeals.filter(meal => {
            if (!meal.notes) return false;
            const tags = meal.notes.split(',').map(t => t.trim());
            return tags.includes(selectedTag);
        });
    }

    // Show appropriate message if no meals match the filter
    if (mealsToDisplay.length === 0 && selectedTag) {
        mealsContainer.innerHTML = `
            <div class="meal-card">
                <p>No meals found with tag "${escapeHtml(selectedTag)}" for this location.</p>
                <button onclick="clearTagFilter()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Clear filter</button>
            </div>`;
        return;
    }

    const sortedMeals = sortMeals(mealsToDisplay, currentSort);
    mealsContainer.innerHTML = sortedMeals.map(meal => createMealCard(meal)).join('');
    attachEventListeners();
}

// Create HTML for a single meal card
function createMealCard(meal) {
    const upvotes = meal.upvotes || 0;
    const downvotes = meal.downvotes || 0;
    const priceInfo = getPriceInfo(meal.price_student);
    const showLocation = currentLocation === ALL_LOCATIONS_KEY;
    const locationLabel = showLocation ? getLocationLabel(meal.mensa_location) : '';

    // Show category for specific types (like Nudelbar, Gemüsebar, etc.)
    const categoryPrefixes = ['nudelbar', 'gemüsebar', 'pastabar', 'salatbar', 'pottkieker'];
    const showCategory = meal.category && categoryPrefixes.some(prefix =>
        meal.category.toLowerCase().includes(prefix)
    );
    // Don't add category prefix if the meal name is already the same as the category
    const categoryMatchesMealName = meal.category && meal.name &&
        meal.category.toLowerCase().trim() === meal.name.toLowerCase().trim();
    const displayName = showCategory && !categoryMatchesMealName
        ? `${meal.category}: ${meal.name}`
        : meal.name;

    // Photo gallery HTML (only if photos exist)
    const photoCount = meal.photos?.count || 0;
    const photoThumbnails = meal.photos?.thumbnails || [];
    const photoGalleryHTML = photoCount > 0 ? `
        <div class="meal-photos-section">
            <div class="meal-photos-gallery">
                ${photoThumbnails.map((url, index) => `
                    <img src="${url}" alt="Food photo" class="meal-photo-thumb" onclick="openMealPhotosViewer(${meal.id}, ${index}, '${escapeHtml(displayName)}')">
                `).join('')}
                <div class="meal-photo-count" onclick="openMealPhotosViewer(${meal.id}, 0, '${escapeHtml(displayName)}')">
                    📸 ${photoCount} photo${photoCount > 1 ? 's' : ''}
                </div>
            </div>
        </div>
    ` : '';

    return `
        <div class="meal-card" data-meal-id="${meal.id}" data-location="${meal.mensa_location || ''}">
            <div class="meal-header">
                <div class="meal-info">
                    ${showLocation && locationLabel ? `<div class="meal-location" data-location="${meal.mensa_location || ''}">${escapeHtml(locationLabel)}</div>` : ''}
                    <div class="meal-name">${escapeHtml(displayName)}</div>
                    ${meal.notes ? `<div class="meal-notes">${escapeHtml(meal.notes)}</div>` : ''}
                    ${priceInfo.display ? `<div class="meal-price">${escapeHtml(priceInfo.display)}</div>` : ''}
                </div>
                <div class="vote-section">
                    <div class="vote-item">
                        <button class="vote-btn upvote-btn" data-meal-id="${meal.id}" data-vote="up">↑</button>
                        <span class="vote-count vote-count-up">${upvotes}</span>
                    </div>
                    <div class="vote-item">
                        <button class="vote-btn downvote-btn" data-meal-id="${meal.id}" data-vote="down">↓</button>
                        <span class="vote-count vote-count-down">${downvotes}</span>
                    </div>
                </div>
            </div>
            ${photoGalleryHTML}
            <button class="toggle-comments-btn" data-meal-id="${meal.id}">
                💬 Show Comments (${meal.comment_count || 0})
            </button>
            <div class="comments-section" id="comments-${meal.id}" style="display: none;">
                <div class="comments-header">[ COMMENTS ]</div>
                <div class="comments-list" id="comments-list-${meal.id}">
                    <div class="loading">Loading comments...</div>
                </div>
                <form class="comment-form" data-meal-id="${meal.id}">
                    <input type="text" name="author_name" placeholder="Your name" required maxlength="50">
                    <textarea name="comment_text" placeholder="Your comment (max 500 chars)" required maxlength="500"></textarea>
                    <button type="submit">Post Comment</button>
                </form>
            </div>
        </div>
    `;
}

// Attach event listeners to dynamically created elements
function attachEventListeners() {
    // Vote buttons
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', handleVote);
    });

    // Toggle comments
    document.querySelectorAll('.toggle-comments-btn').forEach(btn => {
        btn.addEventListener('click', handleToggleComments);
    });

    // Comment forms
    document.querySelectorAll('.comment-form').forEach(form => {
        form.addEventListener('submit', handleCommentSubmit);
    });
}

// Handle voting
async function handleVote(e) {
    const btn = e.currentTarget;
    const mealId = btn.dataset.mealId;
    const voteType = btn.dataset.vote;
    const isActive = btn.classList.contains('active');

    try {
        let response, data;

        // If clicking an active button, remove the vote
        if (isActive) {
            response = await fetch(`${API_BASE}/votes/${mealId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to remove vote');
            data = await response.json();

            // Clear active state on both buttons
            const mealCard = btn.closest('.meal-card');
            mealCard.querySelector('.vote-btn[data-vote="up"]').classList.remove('active');
            mealCard.querySelector('.vote-btn[data-vote="down"]').classList.remove('active');

            // Get updated vote counts
            const countsResponse = await fetch(`${API_BASE}/votes/${mealId}`);
            if (countsResponse.ok) {
                const counts = await countsResponse.json();
                data.upvotes = counts.upvotes;
                data.downvotes = counts.downvotes;
            }
        } else {
            // Cast / toggle vote. Backend toggles off if same type exists
            response = await fetch(`${API_BASE}/votes/${mealId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vote_type: voteType })
            });
            if (!response.ok) throw new Error('Failed to vote');
            data = await response.json();

            // Use server-provided user_vote to set active state accurately
            const mealCard = btn.closest('.meal-card');
            const upBtn = mealCard.querySelector('.vote-btn[data-vote="up"]');
            const downBtn = mealCard.querySelector('.vote-btn[data-vote="down"]');
            if (data.user_vote === 'up') {
                upBtn?.classList.add('active');
                downBtn?.classList.remove('active');
            } else if (data.user_vote === 'down') {
                downBtn?.classList.add('active');
                upBtn?.classList.remove('active');
            } else {
                upBtn?.classList.remove('active');
                downBtn?.classList.remove('active');
            }
        }

        // Update vote count display
        const mealCard = btn.closest('.meal-card');
        const upCountEl = mealCard.querySelector('.vote-count-up');
        const downCountEl = mealCard.querySelector('.vote-count-down');

        if (upCountEl) {
            upCountEl.textContent = data.upvotes || 0;
        }
        if (downCountEl) {
            downCountEl.textContent = data.downvotes || 0;
        }

        const mealIndex = currentMeals.findIndex(m => String(m.id) === String(mealId));
        if (mealIndex !== -1) {
            currentMeals[mealIndex] = {
                ...currentMeals[mealIndex],
                upvotes: data.upvotes || 0,
                downvotes: data.downvotes || 0
            };

            if (currentSort === 'upvotes') {
                renderMeals();
            }
        }

    } catch (error) {
        console.error('Error voting:', error);
        showError('Failed to record vote. Please try again.');
    }
}

// Toggle comments section
async function handleToggleComments(e) {
    const btn = e.currentTarget;
    const mealId = btn.dataset.mealId;
    const commentsSection = document.getElementById(`comments-${mealId}`);

    // Get current comment count from meal data
    const meal = currentMeals.find(m => String(m.id) === String(mealId));
    const count = meal?.comment_count || 0;

    if (commentsSection.style.display === 'none') {
        commentsSection.style.display = 'block';
        btn.innerHTML = `💬 Hide Comments (${count})`;
        await loadComments(mealId);
    } else {
        commentsSection.style.display = 'none';
        btn.innerHTML = `💬 Show Comments (${count})`;
    }
}

// Load comments for a meal
async function loadComments(mealId) {
    const commentsList = document.getElementById(`comments-list-${mealId}`);
    commentsList.innerHTML = '<div class="loading">Loading comments...</div>';

    try {
        const response = await fetch(`${API_BASE}/comments/${mealId}`);

        if (!response.ok) {
            throw new Error('Failed to load comments');
        }

        const data = await response.json();
        displayComments(mealId, data.comments);

    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = '<p>Failed to load comments.</p>';
    }
}

// Organize comments into hierarchy (recursive nesting)
function organizeComments(comments) {
    // Create a map for quick lookup
    const commentMap = new Map();
    comments.forEach(comment => {
        commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Build the tree structure
    const topLevel = [];
    commentMap.forEach(comment => {
        if (comment.parent_comment_id) {
            const parent = commentMap.get(comment.parent_comment_id);
            if (parent) {
                parent.replies.push(comment);
            }
        } else {
            topLevel.push(comment);
        }
    });

    return topLevel;
}

// Recursive function to render a single comment and its replies
function renderComment(comment, mealId) {
    return `
        <div class="comment ${comment.parent_comment_id ? 'comment-reply' : ''}" data-comment-id="${comment.id}">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.author_name)}</span>
                <span class="comment-time">${formatTime(comment.timestamp)}</span>
                ${comment.is_owner ? `<button class="delete-comment-btn" onclick="handleDeleteMealComment(${comment.id}, ${mealId})" title="Delete comment">×</button>` : ''}
            </div>
            <div class="comment-text">${escapeHtml(comment.comment_text)}</div>
            <button class="reply-btn" onclick="handleShowReplyForm(${comment.id}, ${mealId})">Reply</button>
            <div class="reply-form-container" id="reply-form-${comment.id}" style="display: none;">
                <form class="comment-form reply-form" onsubmit="handleReplySubmit(event, ${comment.id}, ${mealId})">
                    <input type="text" name="author_name" placeholder="Your name" maxlength="50" required>
                    <textarea name="comment_text" placeholder="Your reply..." maxlength="500" required></textarea>
                    <div class="reply-form-actions">
                        <button type="submit">Post Reply</button>
                        <button type="button" onclick="handleCancelReply(${comment.id})">Cancel</button>
                    </div>
                </form>
            </div>
            ${comment.replies && comment.replies.length > 0 ? `
                <div class="comment-replies">
                    ${comment.replies.map(reply => renderComment(reply, mealId)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// Display comments
function displayComments(mealId, comments) {
    const commentsList = document.getElementById(`comments-list-${mealId}`);

    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p style="color: #999; font-size: 0.9em;">No comments yet. Be the first to comment!</p>';
        return;
    }

    const organizedComments = organizeComments(comments);
    const html = organizedComments.map(comment => renderComment(comment, mealId)).join('');
    commentsList.innerHTML = html;
}

// Handle delete meal comment
async function handleDeleteMealComment(commentId, mealId) {
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete comment');
        }

        // Remove comment from UI
        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentEl) {
            commentEl.remove();
        }

        // Update comment count in currentMeals array
        const mealIndex = currentMeals.findIndex(m => String(m.id) === String(mealId));
        if (mealIndex !== -1 && currentMeals[mealIndex].comment_count > 0) {
            currentMeals[mealIndex].comment_count--;

            // Update button text
            const btn = document.querySelector(`.toggle-comments-btn[data-meal-id="${mealId}"]`);
            const commentsSection = document.getElementById(`comments-${mealId}`);
            if (btn) {
                const count = currentMeals[mealIndex].comment_count;
                const isHidden = commentsSection.style.display === 'none';
                const text = isHidden ? 'Show Comments' : 'Hide Comments';
                btn.innerHTML = `💬 ${text} (${count})`;
            }
        }

        // Check if comments list is empty
        const commentsList = document.getElementById(`comments-list-${mealId}`);
        if (commentsList && commentsList.children.length === 0) {
            commentsList.innerHTML = '<p style="color: #999; font-size: 0.9em;">No comments yet. Be the first to comment!</p>';
        }

    } catch (error) {
        console.error('Error deleting comment:', error);
        showError(error.message || 'Failed to delete comment. You can only delete your own comments.');
    }
}

// Expose function to global scope for onclick
window.handleDeleteMealComment = handleDeleteMealComment;

// Show reply form
function handleShowReplyForm(commentId, mealId) {
    const replyFormContainer = document.getElementById(`reply-form-${commentId}`);
    if (replyFormContainer) {
        replyFormContainer.style.display = 'block';
        // Focus on the name input
        const nameInput = replyFormContainer.querySelector('[name="author_name"]');
        if (nameInput) nameInput.focus();
    }
}

// Cancel reply
function handleCancelReply(commentId) {
    const replyFormContainer = document.getElementById(`reply-form-${commentId}`);
    if (replyFormContainer) {
        replyFormContainer.style.display = 'none';
        // Clear the form
        const form = replyFormContainer.querySelector('form');
        if (form) form.reset();
    }
}

// Handle reply submission
async function handleReplySubmit(e, parentCommentId, mealId) {
    e.preventDefault();

    const form = e.target;
    const author_name = form.querySelector('[name="author_name"]').value;
    const comment_text = form.querySelector('[name="comment_text"]').value;

    try {
        const response = await fetch(`${API_BASE}/comments/${mealId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                author_name,
                comment_text,
                parent_comment_id: parentCommentId
            })
        });

        let responseData = {};
        try {
            responseData = await response.json();
        } catch (parseError) {
            responseData = {};
        }

        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to post reply');
        }

        // Clear form and hide
        form.reset();
        handleCancelReply(parentCommentId);

        // Update comment count (replies also count as comments)
        const mealIndex = currentMeals.findIndex(m => String(m.id) === String(mealId));
        if (mealIndex !== -1) {
            currentMeals[mealIndex].comment_count = (currentMeals[mealIndex].comment_count || 0) + 1;

            // Update button text
            const btn = document.querySelector(`.toggle-comments-btn[data-meal-id="${mealId}"]`);
            if (btn) {
                const count = currentMeals[mealIndex].comment_count;
                btn.innerHTML = `💬 Hide Comments (${count})`;
            }
        }

        // Reload comments
        await loadComments(mealId);

    } catch (error) {
        console.error('Error posting reply:', error);
        showError(error.message || 'Failed to post reply. Please try again.');
    }
}

// Expose functions to global scope
window.handleShowReplyForm = handleShowReplyForm;
window.handleCancelReply = handleCancelReply;
window.handleReplySubmit = handleReplySubmit;

// Handle comment submission
async function handleCommentSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const mealId = form.dataset.mealId;
    const author_name = form.querySelector('[name="author_name"]').value;
    const comment_text = form.querySelector('[name="comment_text"]').value;

    try {
        const response = await fetch(`${API_BASE}/comments/${mealId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ author_name, comment_text })
        });

        let responseData = {};
        try {
            responseData = await response.json();
        } catch (parseError) {
            responseData = {};
        }

        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to post comment');
        }

        // Clear form
        form.reset();

        // Update comment count in currentMeals array
        const mealIndex = currentMeals.findIndex(m => String(m.id) === String(mealId));
        if (mealIndex !== -1) {
            currentMeals[mealIndex].comment_count = (currentMeals[mealIndex].comment_count || 0) + 1;

            // Update button text
            const btn = document.querySelector(`.toggle-comments-btn[data-meal-id="${mealId}"]`);
            if (btn) {
                const count = currentMeals[mealIndex].comment_count;
                btn.innerHTML = `💬 Hide Comments (${count})`;
            }
        }

        // Reload comments
        await loadComments(mealId);

    } catch (error) {
        console.error('Error posting comment:', error);
        showError(error.message || 'Failed to post comment. Please try again.');
    }
}

// Utility functions
function showLoading() {
    loadingEl.style.display = 'block';
    mealsContainer.innerHTML = '';
}

function hideLoading() {
    loadingEl.style.display = 'none';
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    errorEl.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getLocationLabel(locationId) {
    if (!locationId) {
        return 'Unknown Mensa';
    }

    return LOCATION_LABELS[locationId] || locationId;
}

function getPriceInfo(price) {
    if (!price && price !== 0) {
        return { display: '', numeric: null, isPerHundred: false };
    }

    const normalized = String(price).replace(',', '.');
    const numeric = parseFloat(normalized);

    if (Number.isNaN(numeric)) {
        return {
            display: `Students: €${String(price)}`,
            numeric: null,
            isPerHundred: false
        };
    }

    const display = numeric.toFixed(2);
    const isPerHundred = numeric <= 1;
    const suffix = isPerHundred ? ' /100g' : '';

    return {
        display: `Students: €${display}${suffix}`,
        numeric,
        isPerHundred
    };
}

function sortMeals(meals, sortOption) {
    if (!Array.isArray(meals)) {
        return [];
    }

    switch (sortOption) {
        case 'price':
            return [...meals].sort(compareByPrice);
        case 'upvotes':
        default:
            return [...meals].sort(compareByUpvotes);
    }
}

function compareByPrice(a, b) {
    const infoA = getPriceInfo(a.price_student);
    const infoB = getPriceInfo(b.price_student);

    if (infoA.isPerHundred !== infoB.isPerHundred) {
        return infoA.isPerHundred ? 1 : -1;
    }

    if (infoA.numeric === null && infoB.numeric !== null) return 1;
    if (infoB.numeric === null && infoA.numeric !== null) return -1;
    if (infoA.numeric === null && infoB.numeric === null) return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

    const diff = infoA.numeric - infoB.numeric;
    if (diff !== 0) {
        return diff;
    }

    if (currentLocation === ALL_LOCATIONS_KEY) {
        const locationDiff = getLocationLabel(a.mensa_location).localeCompare(
            getLocationLabel(b.mensa_location),
            'de',
            { sensitivity: 'base' }
        );
        if (locationDiff !== 0) {
            return locationDiff;
        }
    }

    const idxA = a._originalIndex ?? 0;
    const idxB = b._originalIndex ?? 0;

    if (idxA !== idxB) {
        return idxA - idxB;
    }

    return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
}

function compareByUpvotes(a, b) {
    const netA = getNetVotes(a);
    const netB = getNetVotes(b);

    if (netA !== netB) {
        return netB - netA;
    }

    const upA = a.upvotes || 0;
    const upB = b.upvotes || 0;

    if (upA !== upB) {
        return upB - upA;
    }

    if (currentLocation === ALL_LOCATIONS_KEY) {
        const locationDiff = getLocationLabel(a.mensa_location).localeCompare(
            getLocationLabel(b.mensa_location),
            'de',
            { sensitivity: 'base' }
        );
        if (locationDiff !== 0) {
            return locationDiff;
        }
    }

    const idxA = a._originalIndex ?? 0;
    const idxB = b._originalIndex ?? 0;

    if (idxA !== idxB) {
        return idxA - idxB;
    }

    return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
}

function getNetVotes(meal) {
    return (meal.upvotes || 0) - (meal.downvotes || 0);
}

// Modal functionality for viewing meal photos
// Open image viewer for meal photos
async function openMealPhotosViewer(mealId, startIndex = 0, mealName = '') {
    try {
        // Fetch all photos for this meal
        const response = await fetch(`${API_BASE}/photos/by-meal/${mealId}`);
        if (!response.ok) {
            throw new Error('Failed to load photos');
        }

        const data = await response.json();
        const photos = data.photos || [];

        if (photos.length === 0) {
            showError('No photos found for this meal');
            return;
        }

        // Transform photos to match viewer expected format
        const viewerPhotos = photos.map(photo => ({
            id: photo.id,
            photo_url: photo.photo_url,
            meal_name: photo.meal_name || mealName,
            caption: photo.caption || '',
            username: photo.author_name || 'Anonymous',
            likes_count: photo.vote_count || 0,
            user_has_liked: photo.user_voted || false
        }));

        // Open the image viewer
        imageViewer.open(viewerPhotos, startIndex, handlePhotoLikeInViewer);

    } catch (error) {
        console.error('Error loading photos:', error);
        showError(error.message || 'Failed to load photos');
    }
}

// Handle photo like from image viewer
async function handlePhotoLikeInViewer(photoId, currentLikedState) {
    try {
        const resp = await fetch(`${API_BASE}/photos/${photoId}/vote`, { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Failed to update like');
        }

        return {
            success: true,
            user_has_liked: data.user_voted,
            likes_count: data.vote_count
        };
    } catch (err) {
        console.error('Photo like error:', err);
        showError(err.message || 'Failed to like photo');
        return { success: false };
    }
}

// Expose viewer function to global scope
window.openMealPhotosViewer = openMealPhotosViewer;

// Toggle like for a photo from the meal modal
async function handlePhotoLike(photoId, btnEl) {
    try {
        const resp = await fetch(`${API_BASE}/photos/${photoId}/vote`, { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Failed to update like');
        }

        // Update count and state using server response without replacing the button markup
        const countEl = btnEl.querySelector('.like-count');
        if (countEl) {
            countEl.textContent = data.vote_count;
        }
        if (data.user_voted) {
            btnEl.classList.add('voted');
        } else {
            btnEl.classList.remove('voted');
        }
    } catch (err) {
        console.error('Photo like error:', err);
        showError(err.message || 'Failed to like photo');
    }
}

// Expose for inline onclick
window.handlePhotoLike = handlePhotoLike;

function formatTime(timestamp) {
    // Normalize SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS") to ISO with Z
    let date;
    if (typeof timestamp === 'string') {
        const m = timestamp.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
        if (m) {
            date = new Date(`${m[1]}T${m[2]}Z`);
        } else {
            date = new Date(timestamp);
        }
    } else {
        date = new Date(timestamp);
    }

    if (isNaN(date)) return '';

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
}

// Tag filtering functionality
function updateTagFilterBar() {
    const tagFilterBar = document.getElementById('tag-filter-bar');
    const tagFilterList = document.getElementById('tag-filter-list');

    if (!tagFilterBar || !tagFilterList) return;

    // Extract all unique tags from current meals
    const allTags = new Set();
    currentMeals.forEach(meal => {
        if (meal.notes) {
            const tags = meal.notes.split(',').map(t => t.trim());
            tags.forEach(tag => {
                if (tag) allTags.add(tag);
            });
        }
    });

    // If no tags available, hide the filter bar
    if (allTags.size === 0) {
        tagFilterBar.style.display = 'none';
        return;
    }

    // Show the filter bar and populate with tags
    tagFilterBar.style.display = 'flex';

    // Sort tags alphabetically
    const sortedTags = Array.from(allTags).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    // Create clickable tag elements
    tagFilterList.innerHTML = sortedTags.map(tag => {
        const isActive = selectedTag === tag;
        return `<span class="filter-tag ${isActive ? 'active' : ''}" onclick="handleTagClick('${escapeHtml(tag).replace(/'/g, '&#39;')}')">${escapeHtml(tag)}</span>`;
    }).join('');
}

function handleTagClick(tag) {
    if (selectedTag === tag) {
        // Clicking the same tag again clears the filter
        selectedTag = null;
    } else {
        // Set the new tag filter
        selectedTag = tag;
    }
    renderMeals();
}

function clearTagFilter() {
    selectedTag = null;
    renderMeals();
}

// Expose functions to global scope
window.handleTagClick = handleTagClick;
window.clearTagFilter = clearTagFilter;
