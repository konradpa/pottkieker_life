/**
 * ImageViewer - Full-screen image viewer component
 * Features: Navigation, keyboard shortcuts, touch support, photo info display
 */

class ImageViewer {
    constructor() {
        this.photos = [];
        this.currentIndex = 0;
        this.overlay = null;
        this.onLikeCallback = null;
        this.isOpen = false;
    }

    /**
     * Open the image viewer
     * @param {Array} photos - Array of photo objects with structure:
     *   {id, photo_url, meal_name, caption, username, likes_count, user_has_liked}
     * @param {number} startIndex - Index of the photo to display first
     * @param {function} onLikeCallback - Optional callback when like button is clicked
     */
    open(photos, startIndex = 0, onLikeCallback = null) {
        if (!photos || photos.length === 0) {
            console.error('No photos provided to image viewer');
            return;
        }

        this.photos = photos;
        this.currentIndex = startIndex;
        this.onLikeCallback = onLikeCallback;
        this.isOpen = true;

        this.createOverlay();
        this.render();
        this.attachEventListeners();
        this.preloadAdjacentImages();

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the image viewer
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.removeEventListeners();

        // Fade out animation
        if (this.overlay) {
            this.overlay.style.animation = 'fadeOut var(--t-fast) ease-out';
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
                this.overlay = null;
            }, 200);
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    /**
     * Create the overlay DOM structure
     */
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'image-viewer-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.innerHTML = `
            <div class="image-viewer-container">
                <button class="image-viewer-close" aria-label="Close viewer">×</button>
                <div class="image-viewer-counter"></div>

                <div class="image-viewer-main">
                    <button class="image-viewer-nav image-viewer-prev" aria-label="Previous image">‹</button>
                    <img class="image-viewer-image" alt="Photo" />
                    <button class="image-viewer-nav image-viewer-next" aria-label="Next image">›</button>
                </div>

                <div class="image-viewer-info">
                    <div class="image-viewer-meal-name"></div>
                    <div class="image-viewer-caption"></div>
                    <div class="image-viewer-meta">
                        <div class="image-viewer-author"></div>
                        <button class="image-viewer-like-btn">
                            <span class="like-icon">♡</span>
                            <span class="like-count">0</span>
                        </button>
                    </div>
                </div>

                <div class="image-viewer-hint">
                    ← → Navigate | ESC Close
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    /**
     * Render current photo
     */
    render() {
        if (!this.overlay || !this.photos[this.currentIndex]) return;

        const photo = this.photos[this.currentIndex];
        const img = this.overlay.querySelector('.image-viewer-image');
        const counter = this.overlay.querySelector('.image-viewer-counter');
        const mealName = this.overlay.querySelector('.image-viewer-meal-name');
        const caption = this.overlay.querySelector('.image-viewer-caption');
        const author = this.overlay.querySelector('.image-viewer-author');
        const likeBtn = this.overlay.querySelector('.image-viewer-like-btn');
        const likeIcon = this.overlay.querySelector('.like-icon');
        const likeCount = this.overlay.querySelector('.like-count');
        const prevBtn = this.overlay.querySelector('.image-viewer-prev');
        const nextBtn = this.overlay.querySelector('.image-viewer-next');

        // Update image
        img.src = photo.photo_url;
        img.alt = photo.meal_name || 'Photo';

        // Update counter
        counter.textContent = `${this.currentIndex + 1} / ${this.photos.length}`;

        // Update info
        mealName.textContent = photo.meal_name || 'Unknown Meal';
        caption.textContent = photo.caption || '';
        caption.style.display = photo.caption ? 'block' : 'none';
        author.innerHTML = photo.username ? `By <strong>${this.escapeHtml(photo.username)}</strong>` : '';

        // Update like button
        const isLiked = photo.user_has_liked || false;
        const likesCount = photo.likes_count || 0;
        likeIcon.textContent = isLiked ? '♥' : '♡';
        likeCount.textContent = likesCount;
        likeBtn.classList.toggle('liked', isLiked);
        likeBtn.style.display = this.onLikeCallback ? 'flex' : 'none';

        // Update navigation buttons
        prevBtn.classList.toggle('disabled', this.currentIndex === 0);
        nextBtn.classList.toggle('disabled', this.currentIndex === this.photos.length - 1);

        // Trigger slide-in animation
        img.style.animation = 'none';
        setTimeout(() => {
            img.style.animation = 'imageSlideIn var(--t-med) ease-out';
        }, 10);
    }

    /**
     * Navigate to previous photo
     */
    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.render();
            this.preloadAdjacentImages();
        }
    }

    /**
     * Navigate to next photo
     */
    next() {
        if (this.currentIndex < this.photos.length - 1) {
            this.currentIndex++;
            this.render();
            this.preloadAdjacentImages();
        }
    }

    /**
     * Preload adjacent images for smooth navigation
     */
    preloadAdjacentImages() {
        // Preload previous image
        if (this.currentIndex > 0) {
            const prevImg = new Image();
            prevImg.src = this.photos[this.currentIndex - 1].photo_url;
        }

        // Preload next image
        if (this.currentIndex < this.photos.length - 1) {
            const nextImg = new Image();
            nextImg.src = this.photos[this.currentIndex + 1].photo_url;
        }
    }

    /**
     * Handle like button click
     */
    async handleLike() {
        if (!this.onLikeCallback) return;

        const photo = this.photos[this.currentIndex];
        const result = await this.onLikeCallback(photo.id, photo.user_has_liked);

        if (result && result.success) {
            // Update local state
            photo.user_has_liked = result.user_has_liked;
            photo.likes_count = result.likes_count;
            this.render();
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button
        const closeBtn = this.overlay.querySelector('.image-viewer-close');
        closeBtn.addEventListener('click', () => this.close());

        // Backdrop click (click on overlay, not on content)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Navigation buttons
        const prevBtn = this.overlay.querySelector('.image-viewer-prev');
        const nextBtn = this.overlay.querySelector('.image-viewer-next');
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.prev();
        });
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.next();
        });

        // Like button
        const likeBtn = this.overlay.querySelector('.image-viewer-like-btn');
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleLike();
        });

        // Keyboard navigation
        this.keyboardHandler = (e) => this.handleKeyboard(e);
        document.addEventListener('keydown', this.keyboardHandler);

        // Touch/swipe support for mobile
        this.setupTouchEvents();
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }
        this.removeTouchEvents();
    }

    /**
     * Handle keyboard events
     */
    handleKeyboard(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'Escape':
                this.close();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.prev();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.next();
                break;
        }
    }

    /**
     * Setup touch events for mobile swipe
     */
    setupTouchEvents() {
        let touchStartX = 0;
        let touchEndX = 0;

        this.touchStartHandler = (e) => {
            touchStartX = e.changedTouches[0].screenX;
        };

        this.touchEndHandler = (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe(touchStartX, touchEndX);
        };

        const img = this.overlay.querySelector('.image-viewer-image');
        img.addEventListener('touchstart', this.touchStartHandler);
        img.addEventListener('touchend', this.touchEndHandler);
    }

    /**
     * Remove touch event listeners
     */
    removeTouchEvents() {
        if (this.overlay) {
            const img = this.overlay.querySelector('.image-viewer-image');
            if (img && this.touchStartHandler && this.touchEndHandler) {
                img.removeEventListener('touchstart', this.touchStartHandler);
                img.removeEventListener('touchend', this.touchEndHandler);
            }
        }
    }

    /**
     * Handle swipe gesture
     */
    handleSwipe(startX, endX) {
        const minSwipeDistance = 50;
        const diff = startX - endX;

        if (Math.abs(diff) > minSwipeDistance) {
            if (diff > 0) {
                // Swipe left - next image
                this.next();
            } else {
                // Swipe right - previous image
                this.prev();
            }
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
const imageViewer = new ImageViewer();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.imageViewer = imageViewer;
}
