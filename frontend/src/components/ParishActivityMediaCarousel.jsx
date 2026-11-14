import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import "./ParishActivityMediaCarousel.css";

const SWIPE_THRESHOLD_PX = 48;

function ParishActivityMediaCarousel({
  items = [],
  resolveSrc,
  activityTitle = "Parish activity",
  postedDate = "",
  emptyLabel = "No media available",
  mediaClassName = "",
  variant = "default",
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaAspectRatio, setMediaAspectRatio] = useState("4 / 3");
  const [isZoomed, setIsZoomed] = useState(false);
  const touchStartXRef = useRef(null);
  const trackRef = useRef(null);
  const isPost = variant === "post";

  const applyMediaAspectRatio = (element) => {
    if (!element) return;
    const width = Number(element.naturalWidth || element.videoWidth || 0);
    const height = Number(element.naturalHeight || element.videoHeight || 0);
    if (width > 0 && height > 0) {
      setMediaAspectRatio(`${width} / ${height}`);
    }
  };

  const itemsSignature = useMemo(
    () =>
      items
        .map((item) => `${item?.type || "image"}:${String(item?.filePath || item?.url || "").trim()}`)
        .join("|"),
    [items],
  );

  useEffect(() => {
    setActiveIndex(0);
    setMediaAspectRatio("4 / 3");
    setIsZoomed(false);
  }, [itemsSignature]);

  const mediaCount = items.length;
  const safeIndex = mediaCount > 0 ? Math.max(0, Math.min(activeIndex, mediaCount - 1)) : 0;
  const trackOffsetPercent = mediaCount > 0 ? (safeIndex * 100) / mediaCount : 0;
  const activeItem = mediaCount > 0 ? items[safeIndex] : null;
  const activeSummary = String(activeItem?.summary || activeItem?.description || activeItem?.caption || "").trim();

  useEffect(() => {
    const activeMedia = trackRef.current?.querySelector(
      ".parish-activity-media-carousel-slide.is-active img, .parish-activity-media-carousel-slide.is-active video",
    );
    applyMediaAspectRatio(activeMedia);
  }, [safeIndex, itemsSignature]);

  useEffect(() => {
    if (!isZoomed) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsZoomed(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isZoomed]);

  const openZoom = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsZoomed(true);
  };

  const closeZoom = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsZoomed(false);
  };

  const showPrevious = () => {
    if (mediaCount <= 1) return;
    setActiveIndex((current) => (current - 1 + mediaCount) % mediaCount);
  };

  const showNext = () => {
    if (mediaCount <= 1) return;
    setActiveIndex((current) => (current + 1) % mediaCount);
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches?.[0]?.clientX ?? null;
    touchStartXRef.current = null;
    if (startX == null || endX == null || mediaCount <= 1) return;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (deltaX < 0) showNext();
    else showPrevious();
  };

  const handleArrowClick = (event, direction) => {
    event.preventDefault();
    event.stopPropagation();
    if (direction === "previous") showPrevious();
    else showNext();
  };

  if (mediaCount === 0) {
    return (
      <div className={`parish-activity-media-carousel parish-activity-media-carousel--empty${isPost ? " is-post" : ""}`}>
        <div className="parish-activity-media-carousel-empty">{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div
      className={`parish-activity-media-carousel${isPost ? " is-post" : ""}`}
      style={{
        "--carousel-count": mediaCount,
        "--media-aspect-ratio": mediaAspectRatio,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="parish-activity-media-carousel-stage">
        <div className="parish-activity-media-carousel-viewport" aria-live="polite">
          <div
            ref={trackRef}
            className="parish-activity-media-carousel-track"
            style={{
              width: `${mediaCount * 100}%`,
              transform: `translateX(-${trackOffsetPercent}%)`,
            }}
          >
            {items.map((item, index) => {
              const mediaReference = String(item?.filePath || item?.url || "").trim();
              const src = resolveSrc(mediaReference);
              const altText = `${activityTitle} media ${index + 1}`;
              return (
                <div
                  className={`parish-activity-media-carousel-slide${index === safeIndex ? " is-active" : ""}`}
                  key={`parish-activity-carousel-${index}`}
                >
                  {item?.type === "video" ? (
                    <>
                      <video
                        src={src}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={altText}
                        className={mediaClassName || undefined}
                        onLoadedMetadata={(event) => {
                          if (index === safeIndex) applyMediaAspectRatio(event.currentTarget);
                        }}
                      />
                      <button
                        type="button"
                        className="parish-activity-media-zoom-trigger"
                        aria-label={`Zoom ${altText}`}
                        onClick={openZoom}
                      >
                        <ZoomIn size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="parish-activity-media-zoom-hit"
                      aria-label={`Zoom ${altText}`}
                      onClick={openZoom}
                    >
                      <img
                        src={src}
                        alt={altText}
                        className={mediaClassName || undefined}
                        onLoad={(event) => {
                          if (index === safeIndex) applyMediaAspectRatio(event.currentTarget);
                        }}
                      />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {mediaCount > 1 ? (
          <>
            <button
              type="button"
              className="parish-activity-media-carousel-arrow is-left"
              aria-label="Show previous media"
              onClick={(event) => handleArrowClick(event, "previous")}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="parish-activity-media-carousel-arrow is-right"
              aria-label="Show next media"
              onClick={(event) => handleArrowClick(event, "next")}
            >
              <ChevronRight size={18} />
            </button>
            <div className="parish-activity-media-carousel-dots" role="tablist" aria-label="Parish activity media">
              {items.map((_, index) => (
                <button
                  key={`parish-activity-carousel-dot-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={safeIndex === index}
                  className={`parish-activity-media-carousel-dot${safeIndex === index ? " is-active" : ""}`}
                  aria-label={`Show media ${index + 1}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveIndex(index);
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      {isPost || activeSummary || postedDate ? (
        <div className={`parish-activity-media-carousel-caption${isPost ? " is-post" : ""}`}>
          {activeSummary ? <p>{activeSummary}</p> : null}
          {postedDate ? <time>{postedDate}</time> : null}
        </div>
      ) : null}
      {isZoomed && activeItem
        ? createPortal(
            <div
              className="parish-activity-media-zoom"
              role="dialog"
              aria-modal="true"
              aria-label={`${activityTitle} zoomed media`}
              onClick={closeZoom}
            >
              <button type="button" className="parish-activity-media-zoom-close" aria-label="Close zoom" onClick={closeZoom}>
                <X size={20} />
              </button>
              <div className="parish-activity-media-zoom-body">
                {activeItem.type === "video" ? (
                  <video
                    src={resolveSrc(String(activeItem.filePath || activeItem.url || "").trim())}
                    controls
                    autoPlay
                    playsInline
                    aria-label={`${activityTitle} zoomed video`}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <img
                    src={resolveSrc(String(activeItem.filePath || activeItem.url || "").trim())}
                    alt={`${activityTitle} zoomed media`}
                    onClick={closeZoom}
                  />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default ParishActivityMediaCarousel;
