import { Skeleton } from "@/components/ui/skeleton";

type TableSkeletonProps = {
  columns: number;
  rows?: number;
};

export function TableSkeleton({ columns, rows = 10 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="w-full">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-2">
              <Skeleton className="w-[100px] h-[20px] rounded-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
