"use strict";

(function(exports) {

function sign(number) {
    if (number < 0)
        return -1;
    if (number > 0)
        return 1;
    return 0;
}

function Animator(delegate) {
    this.delegate = delegate;
    this.startTimeStamp = 0;
    this.request_ = null;
};

Animator.prototype.scheduleAnimation = function() {
    if (this.request_)
        return;
    this.request_ = requestAnimationFrame(this.onAnimation_.bind(this));
};

Animator.prototype.startAnimation = function() {
    this.startTimeStamp = 0;
    this.scheduleAnimation();
};

Animator.prototype.stopAnimation = function() {
    cancelAnimationFrame(this.request_);
    this.startTimeStamp = 0;
    this.request_ = null;
};

Animator.prototype.onAnimation_ = function(timeStamp) {
    this.request_ = null;
    if (!this.startTimeStamp)
        this.startTimeStamp = timeStamp;
    if (this.delegate.onAnimation(timeStamp))
        this.scheduleAnimation();
};

function VelocityTracker() {
    this.recentTouchMoves_ = [];
    this.velocityX = 0;
    this.velocityY = 0;
}

VelocityTracker.kTimeWindow = 50;

VelocityTracker.prototype.pruneHistory_ = function(timeStamp) {
    for (var i = 0; i < this.recentTouchMoves_.length; ++i) {
        if (this.recentTouchMoves_[i].timeStamp > timeStamp - VelocityTracker.kTimeWindow) {
            this.recentTouchMoves_ = this.recentTouchMoves_.slice(i);
            return;
        }
    }
    // All touchmoves are old.
    this.recentTouchMoves_ = [];
};

VelocityTracker.prototype.update_ = function(e) {
    this.pruneHistory_(e.timeStamp);
    this.recentTouchMoves_.push(e);

    var oldestTouchMove = this.recentTouchMoves_[0];

    var deltaX = e.changedTouches[0].clientX - oldestTouchMove.changedTouches[0].clientX;
    var deltaY = e.changedTouches[0].clientY - oldestTouchMove.changedTouches[0].clientY;
    var deltaT = e.timeStamp - oldestTouchMove.timeStamp;

    if (deltaT > 0) {
        this.velocityX = deltaX / deltaT;
        this.velocityY = deltaY / deltaT;
    } else {
        this.velocityX = 0;
        this.velocityY = 0;
    }
};

VelocityTracker.prototype.onTouchStart = function(e) {
    this.recentTouchMoves_.push(e);
    this.velocityX = 0;
    this.velocityY = 0;
};

VelocityTracker.prototype.onTouchMove = function(e) {
    this.update_(e);
};

VelocityTracker.prototype.onTouchEnd = function(e) {
    this.update_(e);
    this.recentTouchMoves_ = [];
};

function LinearTimingFunction() {
};

LinearTimingFunction.prototype.scaleTime = function(fraction) {
  return fraction;
};

function CubicBezierTimingFunction(spec) {
  this.map = [];
  for (var ii = 0; ii <= 100; ii += 1) {
    var i = ii / 100;
    this.map.push([
      3 * i * (1 - i) * (1 - i) * spec[0] +
          3 * i * i * (1 - i) * spec[2] + i * i * i,
      3 * i * (1 - i) * (1 - i) * spec[1] +
          3 * i * i * (1 - i) * spec[3] + i * i * i
    ]);
  }
};

CubicBezierTimingFunction.prototype.scaleTime = function(fraction) {
  var fst = 0;
  while (fst !== 100 && fraction > this.map[fst][0]) {
    fst += 1;
  }
  if (fraction === this.map[fst][0] || fst === 0) {
    return this.map[fst][1];
  }
  var yDiff = this.map[fst][1] - this.map[fst - 1][1];
  var xDiff = this.map[fst][0] - this.map[fst - 1][0];
  var p = (fraction - this.map[fst - 1][0]) / xDiff;
  return this.map[fst - 1][1] + p * yDiff;
};

var presetTimingFunctions = {
  'linear': new LinearTimingFunction(),
  'ease': new CubicBezierTimingFunction([0.25, 0.1, 0.25, 1.0]),
  'ease-in': new CubicBezierTimingFunction([0.42, 0, 1.0, 1.0]),
  'ease-out': new CubicBezierTimingFunction([0, 0, 0.58, 1.0]),
  'ease-in-out': new CubicBezierTimingFunction([0.42, 0, 0.58, 1.0]),
};

function DrawerController(options) {
    this.velocityTracker = new VelocityTracker();
    this.target = options.target;
    this.willOpenCallback = options.willOpen;
    
    this.movement = options.movement;
    this.easing = options.curve || 'linear';
    this.animation = options.animation;
    var container = new ParGroup([this.animation], {
      easing: this.easing,
      fill: 'both'
    });
    
    var didCloseCallback = options.didClose;
    container.onend = function() {
      if (this.progress() == 0) {
        didCloseCallback();
      }
    }.bind(this);
    
    this.animationDuration = 0.4;
    
    this.containerTiming = container.specified;
    this.animationTiming = this.animation.specified;
    
    this.player = document.timeline.play(container);
    this.player.paused = true;

    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    this.target.addEventListener('touchstart', this.onTouchStart.bind(this));
};

DrawerController.kMinFlingVelocity = 0.4;  // Matches Android framework.
DrawerController.kTouchSlop = 5;  // Matches Android framework.
DrawerController.kTouchSlopSquare = DrawerController.kTouchSlop * DrawerController.kTouchSlop;

DrawerController.prototype.progress = function() {
  return Math.min(1, Math.max(0,
      this.animation.localTime + this.animation.specified.iterationStart));
};

DrawerController.prototype.isScrubbing = function() {
  return this.player.paused;
}

DrawerController.prototype.prepareAnimationForScrubbing = function() {
    var progress = this.progress();
    
    this.containerTiming.easing = 'linear';
    this.containerTiming.direction = 'normal';

    this.animationTiming.iterations = 1;
    this.animationTiming.iterationStart = 0;

    this.player.paused = true;
    this.player.currentTime = progress;
};

DrawerController.prototype.resumeAnimation = function(direction) {
    var progress = this.progress();

    // Slice the entire open/close animation to play from
    // the current position to one end depending on direction.
    var sliceProgress = 0;
    var sliceStart;
    var sliceEnd;
    
    if (direction == 'normal') {
        sliceStart = progress;
        sliceEnd = 1;
    } else {
        sliceStart = 0;
        sliceEnd = progress;
    }
    
    // If already at the end, seek instead of slicing.
    if (sliceStart == sliceEnd) {
        sliceProgress = 1;
        sliceStart = 0;
        sliceEnd = 1;
    }

    var iterationFraction = sliceEnd - sliceStart;

    this.animationTiming.iterationStart = sliceStart;
    this.animationTiming.iterations = iterationFraction;

    this.containerTiming.direction = direction;
    this.containerTiming.easing = this.easing;

    this.player.paused = false;
    this.player.currentTime = sliceProgress;
    this.player.playbackRate = (1 / this.animationDuration) / (1 / iterationFraction);
};

DrawerController.prototype.fling = function(velocity) {
    this.resumeAnimation(velocity > 0 ? 'normal' : 'reverse');
    
    var fraction = this.player.source.endTime;
    var distance = fraction * this.movement;
    var time = (distance / Math.abs(velocity)) / 1000;
    var rate = fraction / time;

    this.player.playbackRate = rate;
    this.containerTiming.easing = 'linear';
};

DrawerController.prototype.onTouchStart = function(e) {
    this.velocityTracker.onTouchStart(e);

    var touchX = e.changedTouches[0].screenX;
    var touchY = e.changedTouches[0].screenY;
    
    this.target.addEventListener('touchmove', this.onTouchMove);
    this.target.addEventListener('touchend', this.onTouchEnd);
    // TODO(abarth): Handle touchcancel.

    this.baseX = touchX;
    this.startX = touchX;
    this.startY = touchY;
    this.prepareAnimationForScrubbing();
};

DrawerController.prototype.onTouchMove = function(e) {
    var deltaX = e.changedTouches[0].screenX - this.startX;
    var deltaY = e.changedTouches[0].screenY - this.startY;
    if ((this.progress() == 0 || this.progress() == 1) && this.isScrubbing()) {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
            this.target.removeEventListener('touchmove', this.onTouchMove);
            this.target.removeEventListener('touchend', this.onTouchEnd);
            return;
        }
    }

    this.velocityTracker.onTouchMove(e);
    e.preventDefault();

    var deltaX = e.changedTouches[0].screenX - this.baseX;
    this.baseX = e.changedTouches[0].screenX;
    this.player.currentTime += deltaX / this.movement;
};

DrawerController.prototype.onTouchEnd = function(e) {
    this.velocityTracker.onTouchEnd(e);
    this.target.removeEventListener('touchmove', this.onTouchMove);
    this.target.removeEventListener('touchend', this.onTouchEnd);

    var velocityX = this.velocityTracker.velocityX;
    if (Math.abs(velocityX) > DrawerController.kMinFlingVelocity) {
        this.fling(velocityX);
    } else if (this.progress() >= 0.5) {
        this.open();
    } else {
        this.close();
    }
};

DrawerController.prototype.toggle = function() {
    if (this.progress() >= 0.5)
        this.close();
    else
        this.open();
};

DrawerController.prototype.open = function() {
    if (this.progress() == 0)
        this.willOpenCallback.call(this.target);
        
    this.resumeAnimation('normal');
};

DrawerController.prototype.close = function() {
    this.resumeAnimation('reverse');
};


function DismissController(options) {
    this.velocityTracker = new VelocityTracker();
    this.animator = new Animator(this);

    this.target = options.target;
    this.moveCallback = options.onMove;
    this.dismissCallback = options.onDismiss;
    this.curve = presetTimingFunctions[options.curve || 'linear'];

    this.position = 0;
    this.width = 0;
    this.state = DismissController.kInitial;

    this.target.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.target.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.target.addEventListener('touchend', this.onTouchEnd.bind(this));
    // TODO(abarth): Handle touchcancel.
}

DismissController.kInitial = 'initial';
DismissController.kDragging = 'dragging';
DismissController.kSettling = 'settling';
DismissController.kFlinging = 'flinging';
DismissController.kDismissed = 'dismissed';

DismissController.prototype.onTouchStart = function(e) {
    this.velocityTracker.onTouchStart(e);

    this.state = DismissController.kInitial;
    this.animator.stopAnimation();

    this.startX = e.changedTouches[0].clientX;
    this.startY = e.changedTouches[0].clientY;
    this.startPosition = this.position;
};

DismissController.prototype.onTouchMove = function(e) {
    this.velocityTracker.onTouchMove(e);

    if (this.state == DismissController.kInitial) {
        var deltaX = e.changedTouches[0].clientX - this.startX;
        var deltaY = e.changedTouches[0].clientY - this.startY;

        if (deltaX * deltaX + deltaY * deltaY < DrawerController.kTouchSlopSquare) {
            e.preventDefault();
            return;
        }

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
            this.settleToClosestPosition();
            return;
        }

        this.state = DismissController.kDragging;
        this.width = this.target.offsetWidth;
    }

    if (this.state == DismissController.kDragging) {
        e.preventDefault();
        var deltaX = e.changedTouches[0].clientX - this.startX;
        this.position = this.startPosition + deltaX;
        this.animator.scheduleAnimation();
    }
};

DismissController.prototype.onTouchEnd = function(e) {
    this.velocityTracker.onTouchEnd(e);

    if (this.state == DismissController.kDragging) {
        var velocityX = this.velocityTracker.velocityX;
        if (Math.abs(velocityX) > DrawerController.kMinFlingVelocity) {
            this.fling(velocityX);
            return;
        }
        this.settleToClosestPosition();
    }
};

DismissController.prototype.settleToClosestPosition = function() {
    var fraction = this.position / this.width;
    if (fraction > 0.5)
        this.settle(this.width);
    else if (fraction < -0.5)
        this.settle(-this.width);
    else
        this.settle(0)
};

DismissController.prototype.fling = function(velocityX) {
    this.animator.stopAnimation();
    this.animationVelocityX = velocityX;
    this.basePosition = this.position;
    this.state = DismissController.kFlinging;
    this.targetPosition = velocityX < 0 ? -this.width : this.width;
    this.animator.startAnimation();
};

DismissController.prototype.settle = function(targetPosition) {
    this.animator.stopAnimation();
    this.animationDuration = DrawerController.kBaseSettleDurationMS;
    this.state = DismissController.kSettling;
    this.basePosition = this.position;
    this.targetPosition = targetPosition;
    this.animator.startAnimation();
};

DismissController.prototype.computeTargetPosition = function(deltaT) {
    var approximateTargetPosition = 0;
    var movingLeftward = false;

    if (this.state == DismissController.kSettling) {
        var targetFraction = this.curve.scaleTime(deltaT / this.animationDuration);
        var animationWidth = this.targetPosition - this.basePosition;
        approximateTargetPosition = this.basePosition + targetFraction * animationWidth;
        movingLeftward = animationWidth < 0;
    } else if (this.state == DismissController.kFlinging) {
        approximateTargetPosition = this.basePosition + this.animationVelocityX * deltaT;
        movingLeftward = this.animationVelocityX < 0;
    }

    var lowerBound = -this.width;
    var upperBound = this.width;
    if (movingLeftward && this.targetPosition == 0)
        lowerBound = 0;
    else if (!movingLeftward && this.targetPosition == 0)
        upperBound = 0;

    return Math.max(lowerBound, Math.min(upperBound, approximateTargetPosition));
};

DismissController.prototype.onAnimation = function(timeStamp) {
    if (this.state == DismissController.kDragging) {
        this.moveCallback.call(this.target, this.position);
        return false;
    }

    var deltaT = timeStamp - this.animator.startTimeStamp;

    this.position = this.computeTargetPosition(deltaT);
    this.moveCallback.call(this.target, this.position);

    if (this.position != this.targetPosition)
        return true;

    if (this.targetPosition == 0) {
        this.state = DismissController.kInitial;
        return false;
    }

    this.state = DismissController.kDismissed;
    this.dismissCallback.call(this.target, this.targetPosition < 0 ? 'left' : 'right');
    return false;
};

function ScrollAreaToolbarController(options) {
    this.animator = new Animator(this);

    this.moveCallback = options.onMove;
    this.target = options.target;
    this.scrollArea = options.scrollArea;

    this.scrollArea.addEventListener("scroll", this.onScroll.bind(this));
    this.scrollBase = 0;
    this.previousScrollTop = 0;
};

ScrollAreaToolbarController.prototype.restrictToBounds = function(position) {
    return Math.min(Math.max(position, 0), this.height);
};

ScrollAreaToolbarController.prototype.onScroll = function(e) {
    if (!this.height)
        this.height = this.target.offsetHeight;

    var scrollTop = this.scrollArea.scrollTop;
    var scrollDelta = scrollTop - this.scrollBase;
    var scrollDeltaFromPrevious = scrollTop - this.previousScrollTop;
    this.previousScrollTop = scrollTop;
    this.position = this.restrictToBounds(scrollDelta, 0);

    if (sign(scrollDelta) != sign(scrollDeltaFromPrevious))
        this.scrollBase = scrollTop - this.position;

    this.animator.scheduleAnimation();
};

ScrollAreaToolbarController.prototype.onAnimation = function(timeStamp) {
    this.moveCallback.call(this.target, this.position);
    return false;
};

function AnimationController(options) {
    this.animateCallback = options.onAnimate;
    this.animateCompleteCollback = options.onAnimateComplete;
    this.animationDuration = options.duration;
    this.targetPosition = options.targetPosition;
    this.startPosition = options.startPosition;
    this.curve = presetTimingFunctions[options.curve || 'linear'];
    this.isComplete = false;

    this.animator = new Animator(this);
    this.animator.startAnimation();
}

AnimationController.prototype.restrictToBounds = function(position) {
    if (this.targetPosition > 0)
        return Math.min(position, this.targetPosition);
    return Math.max(position, this.targetPosition);
}

AnimationController.prototype.onAnimation = function(timeStamp) {
    var deltaT = timeStamp - this.animator.startTimeStamp;
    var targetFraction = this.curve.scaleTime(deltaT / this.animationDuration);
    var position = this.restrictToBounds(this.startPosition + (this.targetPosition - this.startPosition) * targetFraction);
    this.isComplete = position == this.targetPosition;
    this.animateCallback(position);
    if (this.isComplete)
        this.animateCompleteCollback();
    return !this.isComplete;
}

AnimationController.prototype.stopAnimation = function() {
    this.animator.stopAnimation();
}

AnimationController.prototype.isAnimationComplete = function() {
    return this.isComplete;
}

exports.DrawerController = DrawerController;
exports.DismissController = DismissController;
exports.ScrollAreaToolbarController = ScrollAreaToolbarController;
exports.AnimationController = AnimationController;

})(window);
