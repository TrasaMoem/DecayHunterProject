import smallLockImg from "@/assets/locks/DSL.png";
import worldLockImg from "@/assets/locks/DWL.png";
import newbieLockImg from "@/assets/locks/DNL.png";

interface LockPreviewProps {
  lock: string;
}

function getLockImage(lock: string) {
  switch (lock) {
    case "world":
      return worldLockImg;

    case "newbie":
      return newbieLockImg;

    default:
      return smallLockImg;
  }
}

export function LockPreview({ lock }: LockPreviewProps) {
  return (
    <div className="lock-preview">
      <img
        src={getLockImage(lock)}
        className="lock-preview__image"
        alt={`${lock} lock`}
      />
    </div>
  );
}