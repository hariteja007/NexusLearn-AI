import * as React from "react";
import { cn } from "../../utils/cn";
import { AnimatePresence, motion } from "framer-motion";

const Tooltip = ({ children, content, side = "top", className }) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const sides = {
        top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
        bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
        left: "right-full top-1/2 -translate-y-1/2 mr-2",
        right: "left-full top-1/2 -translate-y-1/2 ml-2",
    };

    const animations = {
        top: { initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 } },
        bottom: { initial: { opacity: 0, y: -5 }, animate: { opacity: 1, y: 0 } },
        left: { initial: { opacity: 0, x: 5 }, animate: { opacity: 1, x: 0 } },
        right: { initial: { opacity: 0, x: -5 }, animate: { opacity: 1, x: 0 } },
    };

    return (
        <div
            className="relative inline-block"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={animations[side].initial}
                        animate={animations[side].animate}
                        exit={animations[side].initial}
                        className={cn(
                            "absolute z-50 overflow-hidden rounded-md border border-glass-border bg-glass-bg backdrop-blur-md px-3 py-1.5 text-xs font-medium text-foreground shadow-md animate-in fade-in-0 zoom-in-95",
                            sides[side],
                            className
                        )}
                    >
                        {content}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export { Tooltip };
