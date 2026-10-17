import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type PhotoRouteFinishDialogProps = {
  destination: string;
  confirmedCount: number;
  totalCount: number;
  onDismiss: () => void;
  onReset: () => void;
};

export function PhotoRouteFinishDialog({
  destination, confirmedCount, totalCount, onDismiss, onReset,
}: PhotoRouteFinishDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} className="photo-route-finish" aria-labelledby={titleId}
      aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
      <div className="photo-route-finish__content">
        <div className="photo-route-finish__icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none"><path d="m12 25 8 8 17-19" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <p className="photo-route-finish__eyebrow">Photo Route</p>
        <h2 id={titleId}>Finish recognized</h2>
        <p id={descriptionId}>Your photo route is complete. The final viewpoint has been confirmed.</p>
        <div className="photo-route-finish__destination">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <div><span>Final viewpoint</span><strong>{destination}</strong></div>
        </div>
        <p className="photo-route-finish__count"><strong>{confirmedCount} of {totalCount}</strong> viewpoints confirmed</p>
        {confirmedCount < totalCount && <p className="photo-route-finish__note">{totalCount - confirmedCount} viewpoints skipped for this test.</p>}
        <p className="photo-route-finish__note">Photo matching has stopped. This confirms the view, not a measured arrival distance.</p>
        <div className="photo-route-finish__actions">
          <button type="button" className="photo-route-finish__done" onClick={onDismiss} autoFocus>Done</button>
          <button type="button" className="photo-route-finish__reset" onClick={onReset}>Reset route</button>
        </div>
      </div>
    </dialog>, document.body,
  );
}
