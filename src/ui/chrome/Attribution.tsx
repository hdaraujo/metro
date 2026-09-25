/** OpenStreetMap attribution, always visible (MapLibre's own control is disabled). */
export function Attribution({ className = '' }: { className?: string }) {
  return (
    <div className={`attribution ${className}`.trim()}>
      © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
    </div>
  );
}
