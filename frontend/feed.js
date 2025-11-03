// DOM Elements
const uploadBtn = document.getElementById('upload-btn');
const uploadFormContainer = document.getElementById('upload-form-container');
const cancelUploadBtn = document.getElementById('cancel-upload-btn');
const photoUploadForm = document.getElementById('photo-upload-form');
const photoInput = document.getElementById('photo-input');
const photoPreview = document.getElementById('photo-preview');
const uploadMensaSelect = document.getElementById('upload-mensa-select');
const mealSelect = document.getElementById('meal-select');
const mensaFilter = document.getElementById('mensa-filter');
const sortFilter = document.getElementById('sort-filter');
const refreshBtn = document.getElementById('refresh-btn');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const uploadErrorDiv = document.getElementById('upload-error');
const photosContainer = document.getElementById('photos-container');
const noPhotosDiv = document.getElementById('no-photos');

// State
let currentPhotos = [];
let votedPhotos = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    setupEventListeners();
    loadVotedPhotos();
});

// Event Listeners
function setupEventListeners() {
    uploadBtn.addEventListener('click', () => {
        uploadFormContainer.style.display = uploadFormContainer.style.display === 'none' ? 'block' : 'none';
    });

    cancelUploadBtn.addEventListener('click', () => {
        uploadFormContainer.style.display = 'none';
        photoUploadForm.reset();
        photoPreview.innerHTML = '';
        mealSelect.disabled = true;
        mealSelect.innerHTML = '<option value="">Select mensa first...</option>';
    });

    uploadMensaSelect.addEventListener('change', handleMensaSelectChange);
    photoInput.addEventListener('change', handlePhotoPreview);
    photoUploadForm.addEventListener('submit', handlePhotoUpload);
    mensaFilter.addEventListener('change', loadPhotos);
    sortFilter.addEventListener('change', loadPhotos);
    refreshBtn.addEventListener('click', loadPhotos);
}

// Handle mensa selection change in upload form
async function handleMensaSelectChange() {
    const selectedMensa = uploadMensaSelect.value;

    if (!selectedMensa) {
        mealSelect.disabled = true;
        mealSelect.innerHTML = '<option value="">Select mensa first...</option>';
        return;
    }

    // Load meals for selected mensa
    await loadMealsForMensa(selectedMensa);
}

// Load meals for a specific mensa
async function loadMealsForMensa(mensa) {
    try {
        mealSelect.disabled = true;
        mealSelect.innerHTML = '<option value="">Loading meals...</option>';

        const response = await fetch(`/api/meals/today?location=${mensa}`);
        const data = await response.json();

        mealSelect.innerHTML = '<option value="">Select a meal...</option>';

        if (data.meals && data.meals.length > 0) {
            data.meals.forEach(meal => {
                const option = document.createElement('option');
                option.value = meal.id;

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

                option.textContent = displayName;
                mealSelect.appendChild(option);
            });
            mealSelect.disabled = false;
        } else {
            mealSelect.innerHTML = '<option value="">No meals available</option>';
        }
    } catch (error) {
        console.error('Error loading meals:', error);
        mealSelect.innerHTML = '<option value="">Error loading meals</option>';
        showUploadError('Failed to load meals. Please try again.');
    }
}

// Photo preview handler
function handlePhotoPreview(event) {
    const file = event.target.files[0];
    photoPreview.innerHTML = '';
    uploadErrorDiv.style.display = 'none';

    if (!file) return;

    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
        showUploadError('Image too large (max 5 MB)');
        photoInput.value = '';
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showUploadError('Please select an image file');
        photoInput.value = '';
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        photoPreview.appendChild(img);
    };
    reader.readAsDataURL(file);
}

// Handle photo upload
async function handlePhotoUpload(event) {
    event.preventDefault();
    uploadErrorDiv.style.display = 'none';

    const formData = new FormData(photoUploadForm);

    if (!photoInput.files[0]) {
        showUploadError('Please select a photo');
        return;
    }

    if (!uploadMensaSelect.value) {
        showUploadError('Please select a mensa location');
        return;
    }

    if (!mealSelect.value) {
        showUploadError('Please select a meal');
        return;
    }

    try {
        const response = await fetch('/api/photos', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        // Success
        uploadFormContainer.style.display = 'none';
        photoUploadForm.reset();
        photoPreview.innerHTML = '';
        mealSelect.disabled = true;
        mealSelect.innerHTML = '<option value="">Select mensa first...</option>';
        loadPhotos();
        showMessage('Photo uploaded successfully!');
    } catch (error) {
        showUploadError(error.message);
    }
}

// Load photos with filters
async function loadPhotos() {
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    noPhotosDiv.style.display = 'none';
    photosContainer.innerHTML = '';

    const mensa = mensaFilter.value;
    const sort = sortFilter.value;

    try {
        const response = await fetch(`/api/photos?mensa=${mensa}&sort=${sort}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load photos');
        }

        currentPhotos = data.photos || [];
        loadingDiv.style.display = 'none';

        if (currentPhotos.length === 0) {
            noPhotosDiv.style.display = 'block';
        } else {
            renderPhotos();
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        showError(error.message);
    }
}

// Render photos
function renderPhotos() {
    photosContainer.innerHTML = '';

    currentPhotos.forEach(photo => {
        const photoCard = createPhotoCard(photo);
        photosContainer.appendChild(photoCard);
    });
}

// Create photo card
function createPhotoCard(photo) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.photoId = photo.id;

    const isVoted = votedPhotos.has(photo.id);
    const deleteButton = photo.is_owner
        ? `<button class="delete-photo-btn" onclick="handleDeletePhoto(${photo.id})" title="Delete photo">×</button>`
        : '';

    card.innerHTML = `
        <div class="photo-image-container">
            <img src="${photo.photo_url}" alt="${photo.meal_name}" class="photo-image" onclick="openPhotoInViewer(${photo.id})">
            ${deleteButton}
        </div>
        <div class="photo-info">
            <div class="photo-meal-name">${escapeHtml(photo.meal_name)}</div>
            <div class="photo-mensa">${getMensaDisplayName(photo.mensa_location)}</div>
            ${photo.caption ? `<div class="photo-caption">${escapeHtml(photo.caption)}</div>` : ''}
            <div class="photo-meta">
                <span class="photo-author">by ${escapeHtml(photo.author_name)}</span>
                <span class="photo-time">${formatTime(photo.created_at)}</span>
            </div>
            <div class="photo-actions">
                <button class="vote-btn ${isVoted ? 'voted' : ''}" onclick="handleVote(${photo.id})">
                    ${isVoted ? '♥' : '♡'} ${photo.vote_count}
                </button>
                <button class="comments-toggle-btn" onclick="toggleComments(${photo.id})">
                    💬 ${photo.comment_count}
                </button>
            </div>
        </div>
        <div id="comments-${photo.id}" class="photo-comments" style="display: none;">
            <div class="comment-form">
                <input type="text" placeholder="Your name" id="comment-author-${photo.id}" maxlength="50">
                <textarea placeholder="Add a comment..." id="comment-text-${photo.id}" maxlength="500"></textarea>
                <button class="comment-submit-btn" onclick="handleAddComment(${photo.id})">Post Comment</button>
            </div>
            <div class="comments-list" id="comments-list-${photo.id}">
                <div class="loading" style="font-size: 0.9em; color: var(--text-muted);">Loading comments...</div>
            </div>
        </div>
    `;

    return card;
}

// Handle like toggle
async function handleVote(photoId) {
    const card = document.querySelector(`[data-photo-id="${photoId}"]`);
    if (!card) return;
    const voteBtn = card.querySelector('.vote-btn');
    const wasVoted = voteBtn.classList.contains('voted') || votedPhotos.has(photoId);

    try {
        const response = await fetch(`/api/photos/${photoId}/vote`, { method: 'POST' });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update like');
        }

        // Toggle UI state + local storage
        if (wasVoted) {
            voteBtn.classList.remove('voted');
            votedPhotos.delete(photoId);
            voteBtn.innerHTML = `♡ ${data.vote_count}`;
        } else {
            voteBtn.classList.add('voted');
            votedPhotos.add(photoId);
            voteBtn.innerHTML = `♥ ${data.vote_count}`;
        }
        saveVotedPhotos();
    } catch (error) {
        showError(error.message);
    }
}

// Handle delete photo
async function handleDeletePhoto(photoId) {
    if (!confirm('Are you sure you want to delete this photo?')) {
        return;
    }

    try {
        const response = await fetch(`/api/photos/${photoId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete photo');
        }

        // Remove photo from UI
        const card = document.querySelector(`[data-photo-id="${photoId}"]`);
        if (card) {
            card.remove();
        }

        // Remove from current photos array
        currentPhotos = currentPhotos.filter(p => p.id !== photoId);

        // Show no photos message if needed
        if (currentPhotos.length === 0) {
            noPhotosDiv.style.display = 'block';
        }

        showMessage('Photo deleted successfully');
    } catch (error) {
        showError(error.message);
    }
}

// Toggle comments section
async function toggleComments(photoId) {
    const commentsSection = document.getElementById(`comments-${photoId}`);
    const isHidden = commentsSection.style.display === 'none';

    if (isHidden) {
        commentsSection.style.display = 'block';
        loadComments(photoId);
    } else {
        commentsSection.style.display = 'none';
    }
}

// Load comments for a photo
async function loadComments(photoId) {
    const commentsList = document.getElementById(`comments-list-${photoId}`);

    try {
        const response = await fetch(`/api/photos/${photoId}/comments`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load comments');
        }

        renderComments(photoId, data.comments || []);
    } catch (error) {
        commentsList.innerHTML = `<p style="color: var(--danger); font-size: 0.9em;">${error.message}</p>`;
    }
}

// Render comments
function renderComments(photoId, comments) {
    const commentsList = document.getElementById(`comments-list-${photoId}`);

    if (comments.length === 0) {
        commentsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9em;">No comments yet. Be the first!</p>';
        return;
    }

    commentsList.innerHTML = comments.map(comment => `
        <div class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.author_name)}</span>
                <span class="comment-time">${formatTime(comment.created_at)}</span>
                ${comment.is_owner ? `<button class="delete-comment-btn" onclick="handleDeleteComment(${comment.id}, ${photoId})" title="Delete comment">×</button>` : ''}
            </div>
            <div class="comment-text">${escapeHtml(comment.comment_text)}</div>
        </div>
    `).join('');
}

// Handle add comment
async function handleAddComment(photoId) {
    const authorInput = document.getElementById(`comment-author-${photoId}`);
    const textInput = document.getElementById(`comment-text-${photoId}`);

    const author_name = authorInput.value.trim();
    const comment_text = textInput.value.trim();

    if (!author_name || !comment_text) {
        showError('Name and comment are required');
        return;
    }

    try {
        const response = await fetch(`/api/photos/${photoId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ author_name, comment_text })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to add comment');
        }

        // Clear form
        authorInput.value = '';
        textInput.value = '';

        // Reload comments
        loadComments(photoId);

        // Update comment count
        const card = document.querySelector(`[data-photo-id="${photoId}"]`);
        const photo = currentPhotos.find(p => p.id === photoId);
        if (photo) {
            photo.comment_count++;
            const commentsBtn = card.querySelector('.comments-toggle-btn');
            commentsBtn.innerHTML = `💬 ${photo.comment_count}`;
        }
    } catch (error) {
        showError(error.message);
    }
}

// Handle delete comment
async function handleDeleteComment(commentId, photoId) {
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }

    try {
        const response = await fetch(`/api/photos/comments/${commentId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete comment');
        }

        // Remove comment from UI
        const commentItem = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentItem) {
            commentItem.remove();
        }

        // Update comment count
        const card = document.querySelector(`[data-photo-id="${photoId}"]`);
        const photo = currentPhotos.find(p => p.id === photoId);
        if (photo && photo.comment_count > 0) {
            photo.comment_count--;
            const commentsBtn = card.querySelector('.comments-toggle-btn');
            commentsBtn.innerHTML = `💬 ${photo.comment_count}`;
        }

        // Check if comments list is empty
        const commentsList = document.getElementById(`comments-list-${photoId}`);
        if (commentsList && commentsList.children.length === 0) {
            commentsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9em;">No comments yet. Be the first!</p>';
        }

        showMessage('Comment deleted successfully');
    } catch (error) {
        showError(error.message);
    }
}

// Open photo in image viewer
function openPhotoInViewer(photoId) {
    // Find the index of the clicked photo in currentPhotos
    const photoIndex = currentPhotos.findIndex(p => p.id === photoId);
    if (photoIndex === -1) {
        console.error('Photo not found in current photos');
        return;
    }

    // Transform photos to match viewer expected format
    const viewerPhotos = currentPhotos.map(photo => ({
        id: photo.id,
        photo_url: photo.photo_url,
        meal_name: photo.meal_name,
        caption: photo.caption || '',
        username: photo.author_name,
        likes_count: photo.vote_count,
        user_has_liked: votedPhotos.has(photo.id)
    }));

    // Open the image viewer
    imageViewer.open(viewerPhotos, photoIndex, handlePhotoLikeInViewer);
}

// Handle photo like from image viewer
async function handlePhotoLikeInViewer(photoId, currentLikedState) {
    try {
        const response = await fetch(`/api/photos/${photoId}/vote`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to vote');
        }

        // Update local state
        if (data.user_voted) {
            votedPhotos.add(photoId);
        } else {
            votedPhotos.delete(photoId);
        }
        saveVotedPhotos();

        // Update the photo in currentPhotos array
        const photo = currentPhotos.find(p => p.id === photoId);
        if (photo) {
            photo.vote_count = data.vote_count;
        }

        // Update the UI for the photo card if visible
        const photoCard = document.querySelector(`.photo-card[data-photo-id="${photoId}"]`);
        if (photoCard) {
            const voteBtn = photoCard.querySelector('.vote-btn');
            if (voteBtn) {
                const heartIcon = data.user_voted ? '♥' : '♡';
                voteBtn.innerHTML = `${heartIcon} ${data.vote_count}`;
                voteBtn.classList.toggle('voted', data.user_voted);
            }
        }

        return {
            success: true,
            user_has_liked: data.user_voted,
            likes_count: data.vote_count
        };
    } catch (error) {
        console.error('Error voting photo:', error);
        showError(error.message);
        return { success: false };
    }
}

// Helper functions
function getMensaDisplayName(location) {
    const names = {
        'studierendenhaus': 'Schweinemensa',
        'blattwerk': 'Blattwerk',
        'philturm': 'Philturm'
    };
    return names[location] || location;
}

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

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showUploadError(message) {
    uploadErrorDiv.textContent = message;
    uploadErrorDiv.style.display = 'block';
}

function showMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'hud-toast';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.classList.add('hud-toast--hide');
        const removeToast = () => messageDiv.remove();
        messageDiv.addEventListener('animationend', removeToast, { once: true });
        setTimeout(removeToast, 500); // fallback in case animationend does not fire
    }, 2800);
}

// Vote tracking using localStorage
function loadVotedPhotos() {
    const stored = localStorage.getItem('votedPhotos');
    if (stored) {
        votedPhotos = new Set(JSON.parse(stored));
    }
}

function saveVotedPhotos() {
    localStorage.setItem('votedPhotos', JSON.stringify([...votedPhotos]));
}

// Expose functions to global scope for onclick handlers
window.handleVote = handleVote;
window.handleDeletePhoto = handleDeletePhoto;
window.toggleComments = toggleComments;
window.handleAddComment = handleAddComment;
window.handleDeleteComment = handleDeleteComment;
window.openPhotoInViewer = openPhotoInViewer;
