/**
 * @rag/ui — обёртки shadcn-компонентов и утилиты дизайн-системы.
 * Все компоненты стилизованы ТОЛЬКО через токены из docs/03-DESIGN-SYSTEM.md.
 */
export { cn } from "./lib/utils";
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Input } from "./components/input";
export { Label } from "./components/label";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./components/table";
export { Skeleton } from "./components/skeleton";
