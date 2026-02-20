import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter, ModalOverlay, ModalClose } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { FiHome, FiSettings, FiUser, FiInfo } from 'react-icons/fi';

const DesignSystem = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="p-8 space-y-10 min-h-screen bg-background text-foreground overflow-y-auto">
            <header className="space-y-4">
                <h1 className="text-4xl font-bold font-heading text-gradient">Design System</h1>
                <p className="text-muted-foreground">Foundation: Colors, Typography, Spacing, and Components</p>
            </header>

            {/* Colors Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Colors</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="h-12 w-full bg-primary rounded mb-2"></div>
                        <p className="font-mono text-xs">Primary (Indigo)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="h-12 w-full bg-secondary rounded mb-2"></div>
                        <p className="font-mono text-xs">Secondary (Fuchsia)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="h-12 w-full bg-accent rounded mb-2"></div>
                        <p className="font-mono text-xs">Accent (Cyan)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="h-12 w-full bg-destructive rounded mb-2"></div>
                        <p className="font-mono text-xs">Destructive (Red)</p>
                    </div>
                </div>
            </section>

            {/* Buttons Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Buttons</h2>
                <div className="flex flex-wrap gap-4 items-center">
                    <Button>Default Button</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link Button</Button>
                    <Button variant="gradient">Gradient Action</Button>
                    <Button size="sm">Small</Button>
                    <Button size="lg">Large</Button>
                    <Button size="icon"><FiUser /></Button>
                </div>
            </section>

            {/* Inputs Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Inputs</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Default Input</label>
                        <Input placeholder="Type something..." />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Password Input</label>
                        <Input type="password" placeholder="Password" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Date Input</label>
                        <Input type="date" />
                    </div>
                </div>
            </section>

            {/* Badges Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Badges</h2>
                <div className="flex gap-4">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                    <Badge variant="glass">Glass</Badge>
                    <Badge variant="glow">Glow</Badge>
                </div>
            </section>

            {/* Cards Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Cards</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Default Card</CardTitle>
                            <CardDescription>Basic card structure</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p>Content goes here. This uses the default card variant.</p>
                        </CardContent>
                        <CardFooter>
                            <Button size="sm">Action</Button>
                        </CardFooter>
                    </Card>

                    <Card variant="interactive">
                        <CardHeader>
                            <CardTitle>Interactive Card</CardTitle>
                            <CardDescription>Hover effects enabled</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p>Hover me to see the lift effect. Good for clickable items.</p>
                        </CardContent>
                    </Card>

                    <Card variant="glass">
                        <CardHeader>
                            <CardTitle>Glass Card</CardTitle>
                            <CardDescription>Backdrop blur effect</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p>Perfect for overlays or floating elements on complex backgrounds.</p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Interactive Components Section */}
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold border-b border-border pb-2">Interactive</h2>
                <div className="flex gap-8">
                    {/* Modal Demo */}
                    <div>
                        <h3 className="mb-4 text-lg font-medium">Modal</h3>
                        <Button onClick={() => setIsModalOpen(true)}>Open Modal</Button>

                        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                            <ModalOverlay />
                            <ModalContent>
                                <ModalHeader>
                                    <ModalTitle>Example Modal</ModalTitle>
                                    <ModalDescription>This is a description of the modal action.</ModalDescription>
                                    <ModalClose />
                                </ModalHeader>
                                <CardContent>
                                    <p>This modal uses the Glass Card variant and Framer Motion for animations.</p>
                                    <div className="mt-4 p-4 bg-background/50 rounded border border-border">
                                        <p className="text-sm font-mono">Modal Content Area</p>
                                    </div>
                                </CardContent>
                                <ModalFooter>
                                    <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                    <Button onClick={() => setIsModalOpen(false)}>Confirm</Button>
                                </ModalFooter>
                            </ModalContent>
                        </Modal>
                    </div>

                    {/* Tooltip Demo */}
                    <div>
                        <h3 className="mb-4 text-lg font-medium">Tooltips</h3>
                        <div className="flex gap-4">
                            <Tooltip content="This is a top tooltip">
                                <Button variant="outline">Top</Button>
                            </Tooltip>
                            <Tooltip content="Right side tooltip" side="right">
                                <Button variant="outline">Right</Button>
                            </Tooltip>
                            <Tooltip content="Bottom tooltip" side="bottom">
                                <Button variant="outline">Bottom</Button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default DesignSystem;
