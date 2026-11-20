import * as React from "react"
import { cn } from "cn"
import { Toast as ToastPrimitive } from "radix-ui"

// Not in the shadcn registry for this style (it offers sonner, a further dependency): the same Radix toast
// its earlier component wrapped, from the radix-ui package the other primitives here come from.

function ToastProvider({
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] m-0 flex w-full list-none flex-col gap-2 p-4 outline-none sm:max-w-sm md:bottom-0",
        className
      )}
      {...props}
    />
  )
}

function Toast({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("min-w-24 flex-1 font-medium break-words", className)}
      {...props}
    />
  )
}

function ToastAction({
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Action>) {
  return <ToastPrimitive.Action data-slot="toast-action" {...props} />
}

function ToastClose({
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return <ToastPrimitive.Close data-slot="toast-close" {...props} />
}

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastProvider,
  ToastTitle,
  ToastViewport,
}
