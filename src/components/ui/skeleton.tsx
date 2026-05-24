import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'shimmer rounded-md',
        // fallback animate-pulse for browsers that don't support the shimmer gradient
        'motion-reduce:animate-pulse motion-reduce:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
