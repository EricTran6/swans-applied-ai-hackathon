import { AppHeader } from "@/components/nav/AppHeader";

export default function MattersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
