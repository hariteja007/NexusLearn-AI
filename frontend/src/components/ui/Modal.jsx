import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { Button } from "./Button";
import { Card, CardTitle, CardDescription } from "./Card";
import { FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "framer-motion";

const ModalContext = React.createContext({});

const Modal = ({ children, isOpen, onClose }) => {
    // Lock body scroll when modal is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    return (
        <ModalContext.Provider value={{ onClose }}>
            <AnimatePresence>
                {isOpen && (
                    <div className="relative z-50">
                        {children}
                    </div>
                )}
            </AnimatePresence>
        </ModalContext.Provider>
    );
};

const ModalOverlay = ({ className, ...props }) => {
    const { onClose } = React.useContext(ModalContext);
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={cn(
                "fixed inset-0 bg-black/60 backdrop-blur-sm transition-all",
                className
            )}
            {...props}
        />
    );
};

const ModalContent = ({ className, children, ...props }) => {
    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={cn(
                    "w-full max-w-lg pointer-events-auto",
                    className
                )}
                {...props}
            >
                <Card className="border-glass-border bg-glass-bg backdrop-blur-xl shadow-2xl relative overflow-hidden">
                    {children}
                </Card>
            </motion.div>
        </div>
    );
};

const ModalHeader = ({ className, ...props }) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 p-6 pb-2",
            className
        )}
        {...props}
    />
);

const ModalFooter = ({ className, ...props }) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-2",
            className
        )}
        {...props}
    />
);

const ModalTitle = ({ className, ...props }) => (
    <CardTitle className={cn("text-xl", className)} {...props} />
);

const ModalDescription = ({ className, ...props }) => (
    <CardDescription className={cn(className)} {...props} />
);

const ModalClose = ({ className, ...props }) => {
    const { onClose } = React.useContext(ModalContext);
    return (
        <button
            onClick={onClose}
            className={cn(
                "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                className
            )}
            {...props}
        >
            <FiX className="h-4 w-4" />
            <span className="sr-only">Close</span>
        </button>
    );
};

export {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalTitle,
    ModalDescription,
    ModalClose,
};
