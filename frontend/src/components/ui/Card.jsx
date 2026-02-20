import * as React from "react";
import { cn } from "../../utils/cn";
import { cva } from "class-variance-authority";

const cardVariants = cva(
    "rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300",
    {
        variants: {
            variant: {
                default: "border-border/50",
                interactive: "hover:shadow-lg hover:-translate-y-1 cursor-pointer hover:border-primary/50",
                glass: "bg-glass-bg backdrop-blur-md border-glass-border hover:bg-glass-bg/80",
                neon: "border-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:shadow-[0_0_25px_rgba(99,102,241,0.25)]",
            },
            padding: {
                none: "",
                sm: "p-4",
                md: "p-6",
                lg: "p-8",
            }
        },
        defaultVariants: {
            variant: "default",
            padding: "md",
        },
    }
);

const Card = React.forwardRef(({ className, variant, padding, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, className }))}
        {...props}
    />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col space-y-1.5 p-6", className)}
        {...props}
    />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
        {...props}
    />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex items-center p-6 pt-0", className)}
        {...props}
    />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
