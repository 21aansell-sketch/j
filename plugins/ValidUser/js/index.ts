/*
 * Local Message Edit
 *
 * Revenge Next / Discord Android
 *
 * Lets you long-press another person's message and choose
 * "Edit Locally".
 *
 * The edit is LOCAL ONLY.
 *
 * It does NOT call Discord's message-edit endpoint.
 * Other Discord users continue seeing the original message.
 */

const { lookupModule, waitForModules } = revenge.modules.finders;
const { filters } = revenge.modules.finders;
const { patcher } = revenge;

const mods: Record<string, any> = {};

/* ============================================================
 * STORAGE
 * ============================================================
 */

const edits: Record<string, string> = {};

function messageKey(message: any): string {
    return `${message?.channel_id ?? message?.channelId ?? ""}:${message?.id ?? ""}`;
}

function getEdit(message: any): string | undefined {
    return edits[messageKey(message)];
}

function hasEdit(message: any): boolean {
    return Object.prototype.hasOwnProperty.call(
        edits,
        messageKey(message),
    );
}

function setEdit(message: any, content: string) {
    edits[messageKey(message)] = content;
}

function clearEdit(message: any) {
    delete edits[messageKey(message)];
}


/* ============================================================
 * MODULE LOOKUP
 * ============================================================
 */

function findModules() {
    const [UserStore] = lookupModule(
        filters.withProps(
            "getUser",
            "getCurrentUser",
        ),
    );

    const [MessageStore] = lookupModule(
        filters.withProps(
            "getMessages",
        ),
    );

    /*
     * Discord's ActionSheet implementation.
     *
     * These properties are intentionally looked up rather than
     * importing Discord internals directly because Discord's
     * internal module paths change between versions.
     */
    const [ActionSheet] = lookupModule(
        filters.withProps(
            "openLazy",
            "hideActionSheet",
        ),
    );

    mods.UserStore = UserStore;
    mods.MessageStore = MessageStore;
    mods.ActionSheet = ActionSheet;

    return (
        !!mods.UserStore &&
        !!mods.MessageStore &&
        !!mods.ActionSheet
    );
}


/* ============================================================
 * LOCAL MESSAGE OBJECT
 * ============================================================
 */

function locallyEditedMessage(message: any) {
    const edit = getEdit(message);

    if (edit === undefined) {
        return message;
    }

    return {
        ...message,
        content: edit,
    };
}


/* ============================================================
 * DISPATCH LOCAL UPDATE
 * ============================================================
 */

function refreshMessage(message: any) {
    const Dispatcher =
        revenge.discord.common.flux.Dispatcher;

    if (!Dispatcher || !message?.id) {
        return;
    }

    const edited = locallyEditedMessage(message);

    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",

        message: {
            ...message,

            /*
             * Only the local representation is changed.
             */
            content: edited.content,
        },
    });
}


/* ============================================================
 * CURRENT USER CHECK
 * ============================================================
 */

function isOwnMessage(message: any): boolean {
    const currentUser =
        mods.UserStore?.getCurrentUser?.();

    return (
        !!currentUser?.id &&
        currentUser.id === message?.author?.id
    );
}


/* ============================================================
 * REACT / REACT NATIVE
 * ============================================================
 */

function getReactModules() {
    /*
     * Revenge Next's exposed Discord modules vary between
     * releases, so try the common locations.
     */

    const React =
        revenge.discord?.common?.React ??
        revenge.react ??
        revenge.discord?.common?.react;

    const ReactNative =
        revenge.discord?.common?.ReactNative ??
        revenge.reactNative ??
        revenge.discord?.common?.reactNative;

    return {
        React,
        ReactNative,
    };
}


/* ============================================================
 * EDIT MODAL
 * ============================================================
 */

let modalSetter:
    | ((value: boolean) => void)
    | null = null;

let messageSetter:
    | ((message: any) => void)
    | null = null;

function openEditor(message: any) {
    if (!modalSetter || !messageSetter) {
        console.warn(
            "[LocalMessageEdit] Editor UI is not mounted",
        );
        return;
    }

    messageSetter(message);
    modalSetter(true);
}


function EditorModal() {
    const {
        React,
        ReactNative,
    } = getReactModules();

    if (!React || !ReactNative) {
        return null;
    }

    const {
        View,
        Text,
        TextInput,
        Pressable,
        Modal,
        StyleSheet,
    } = ReactNative;

    const [visible, setVisible] =
        React.useState(false);

    const [message, setMessage] =
        React.useState<any>(null);

    const [content, setContent] =
        React.useState("");

    React.useEffect(() => {
        modalSetter = setVisible;

        messageSetter = (nextMessage) => {
            setMessage(nextMessage);

            if (!nextMessage) {
                setContent("");
                return;
            }

            const existing =
                getEdit(nextMessage);

            setContent(
                existing ??
                nextMessage.content ??
                "",
            );
        };

        return () => {
            modalSetter = null;
            messageSetter = null;
        };
    }, []);


    if (!visible || !message) {
        return null;
    }


    const close = () => {
        setVisible(false);
        setMessage(null);
    };


    const save = () => {
        setEdit(message, content);

        refreshMessage(message);

        close();

        console.log(
            "[LocalMessageEdit] Saved local edit:",
            message.id,
        );
    };


    const clear = () => {
        clearEdit(message);

        /*
         * Restore the original server-side content locally.
         */
        const Dispatcher =
            revenge.discord.common.flux.Dispatcher;

        Dispatcher.dispatch({
            type: "MESSAGE_UPDATE",

            message: {
                ...message,
                content: message.content,
            },
        });

        close();

        console.log(
            "[LocalMessageEdit] Cleared local edit:",
            message.id,
        );
    };


    const styles = StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.75)",
        },

        container: {
            width: "90%",
            maxWidth: 500,
            padding: 20,
            borderRadius: 10,
            backgroundColor: "#2b2d31",
        },

        title: {
            fontSize: 20,
            fontWeight: "700",
            color: "#ffffff",
            marginBottom: 15,
        },

        input: {
            minHeight: 120,
            padding: 12,
            borderRadius: 6,
            backgroundColor: "#1e1f22",
            color: "#ffffff",
            textAlignVertical: "top",
        },

        buttons: {
            flexDirection: "row",
            marginTop: 15,
            gap: 8,
        },

        button: {
            flex: 1,
            padding: 12,
            borderRadius: 6,
            alignItems: "center",
        },

        cancel: {
            backgroundColor: "#4e5058",
        },

        clear: {
            backgroundColor: "#da373c",
        },

        save: {
            backgroundColor: "#5865f2",
        },

        buttonText: {
            color: "#ffffff",
            fontWeight: "600",
        },
    });


    return React.createElement(
        Modal,
        {
            visible: true,
            transparent: true,
            animationType: "fade",
            onRequestClose: close,
        },

        React.createElement(
            View,
            {
                style: styles.overlay,
            },

            React.createElement(
                View,
                {
                    style: styles.container,
                },

                React.createElement(
                    Text,
                    {
                        style: styles.title,
                    },
                    "Edit Message Locally",
                ),

                React.createElement(
                    TextInput,
                    {
                        style: styles.input,

                        value: content,

                        onChangeText:
                            setContent,

                        multiline: true,

                        autoFocus: true,

                        placeholder:
                            "Enter replacement message...",

                        placeholderTextColor:
                            "#949ba4",
                    },
                ),

                React.createElement(
                    View,
                    {
                        style: styles.buttons,
                    },

                    React.createElement(
                        Pressable,
                        {
                            style: [
                                styles.button,
                                styles.cancel,
                            ],

                            onPress: close,
                        },

                        React.createElement(
                            Text,
                            {
                                style:
                                    styles.buttonText,
                            },
                            "Cancel",
                        ),
                    ),

                    hasEdit(message) &&
                        React.createElement(
                            Pressable,
                            {
                                style: [
                                    styles.button,
                                    styles.clear,
                                ],

                                onPress: clear,
                            },

                            React.createElement(
                                Text,
                                {
                                    style:
                                        styles.buttonText,
                                },
                                "Clear",
                            ),
                        ),

                    React.createElement(
                        Pressable,
                        {
                            style: [
                                styles.button,
                                styles.save,
                            ],

                            onPress: save,
                        },

                        React.createElement(
                            Text,
                            {
                                style:
                                    styles.buttonText,
                            },
                            "Save",
                        ),
                    ),
                ),
            ),
        ),
    );
}


/* ============================================================
 * FIND MESSAGE FROM ACTION SHEET
 * ============================================================
 */

function getMessageFromActionSheet(
    args: any[],
): any | null {
    for (const arg of args) {
        if (!arg) continue;

        if (arg.message) {
            return arg.message;
        }

        if (
            arg.props?.message
        ) {
            return arg.props.message;
        }
    }

    return null;
}


/* ============================================================
 * ACTION SHEET PATCH
 * ============================================================
 */

function patchMessageActionSheet(
    cleanup: (fn: () => void) => void,
) {
    const ActionSheet =
        mods.ActionSheet;

    if (
        !ActionSheet?.openLazy
    ) {
        console.warn(
            "[LocalMessageEdit] ActionSheet not found",
        );

        return;
    }


    const unpatch =
        patcher.before(
            ActionSheet,
            "openLazy",
            (args: any[]) => {
                /*
                 * Discord's message long-press action sheet
                 * currently uses MessageLongPressActionSheet.
                 */

                const key =
                    args?.[1];

                if (
                    key !==
                    "MessageLongPressActionSheet"
                ) {
                    return;
                }


                const message =
                    getMessageFromActionSheet(
                        args,
                    );

                if (!message) {
                    return;
                }


                /*
                 * Don't offer local editing on
                 * your own messages.
                 */

                if (
                    isOwnMessage(message)
                ) {
                    return;
                }


                /*
                 * The actual action-sheet component
                 * is loaded asynchronously.
                 */

                const component =
                    args?.[0];

                if (
                    !component?.then
                ) {
                    return;
                }


                component.then(
                    (module: any) => {
                        patchLoadedActionSheet(
                            module,
                            message,
                        );
                    },
                );
            },
        );

    cleanup(unpatch);
}


/* ============================================================
 * PATCH LOADED ACTION SHEET
 * ============================================================
 */

function patchLoadedActionSheet(
    module: any,
    message: any,
) {
    const {
        React,
        ReactNative,
    } = getReactModules();

    if (!React || !ReactNative) {
        return;
    }

    /*
     * Find the default exported React component.
     */

    const component =
        module?.default;

    if (!component) {
        return;
    }


    /*
     * Patch the component's output.
     */

    const unpatch =
        patcher.after(
            component,
            "default",
            (
                _args: any[],
                tree: any,
            ) => {
                try {
                    addLocalEditButton(
                        tree,
                        message,
                    );
                } catch (error) {
                    console.error(
                        "[LocalMessageEdit] Failed to add button:",
                        error,
                    );
                }

                return tree;
            },
        );


    /*
     * The component only lives for the action sheet,
     * so its patch can safely be removed shortly after.
     */

    setTimeout(() => {
        try {
            unpatch();
        } catch {}
    }, 1000);
}


/* ============================================================
 * FIND ACTION SHEET BUTTON ARRAY
 * ============================================================
 */

function findButtonArray(
    tree: any,
): any[] | null {
    if (!tree) {
        return null;
    }

    if (Array.isArray(tree)) {
        /*
         * Look for an array containing action-sheet rows.
         */

        const looksLikeButtons =
            tree.some(
                (item) =>
                    item?.props?.label ||
                    item?.props?.onPress,
            );

        if (looksLikeButtons) {
            return tree;
        }

        for (const item of tree) {
            const result =
                findButtonArray(item);

            if (result) {
                return result;
            }
        }

        return null;
    }

    if (
        typeof tree === "object"
    ) {
        for (
            const value of Object.values(tree)
        ) {
            const result =
                findButtonArray(value);

            if (result) {
                return result;
            }
        }
    }

    return null;
}


/* ============================================================
 * INSERT LOCAL EDIT BUTTON
 * ============================================================
 */

function addLocalEditButton(
    tree: any,
    message: any,
) {
    const buttons =
        findButtonArray(tree);

    if (!buttons) {
        return;
    }


    /*
     * Prevent duplicates.
     */

    const alreadyExists =
        buttons.some(
            (button) =>
                button?.props?.label ===
                "Edit Locally",
        );

    if (alreadyExists) {
        return;
    }


    const {
        React,
        ReactNative,
    } = getReactModules();

    if (!React || !ReactNative) {
        return;
    }


    const ActionSheetRow =
        mods.ActionSheetRow;


    /*
     * If Discord's current ActionSheetRow
     * module is available, use it.
     */

    if (ActionSheetRow) {
        const button =
            React.createElement(
                ActionSheetRow,
                {
                    label:
                        hasEdit(message)
                            ? "Edit Locally ✏️"
                            : "Edit Locally",

                    onPress: () => {
                        mods.ActionSheet
                            ?.hideActionSheet?.();

                        openEditor(message);
                    },
                },
            );

        buttons.push(button);

        return;
    }


    /*
     * Fallback for builds where ActionSheetRow
     * isn't exposed.
     */

    const Pressable =
        ReactNative.Pressable;

    const Text =
        ReactNative.Text;

    const button =
        React.createElement(
            Pressable,
            {
                onPress: () => {
                    mods.ActionSheet
                        ?.hideActionSheet?.();

                    openEditor(message);
                },

                style: {
                    padding: 15,
                },
            },

            React.createElement(
                Text,
                {
                    style: {
                        color: "#ffffff",
                    },
                },

                hasEdit(message)
                    ? "Edit Locally ✏️"
                    : "Edit Locally",
            ),
        );

    buttons.push(button);
}


/* ============================================================
 * MESSAGE STORE PATCH
 * ============================================================
 *
 * This is important.
 *
 * Without this, opening another channel or having Discord
 * reload its MessageStore can make the original server
 * message appear again.
 *
 * We therefore intercept locally retrieved messages and
 * substitute our local content.
 */

function patchMessageStore(
    cleanup: (fn: () => void) => void,
) {
    const MessageStore =
        mods.MessageStore;

    if (!MessageStore) {
        return;
    }


    if (
        typeof MessageStore.getMessage ===
        "function"
    ) {
        const unpatch =
            patcher.after(
                MessageStore,
                "getMessage",
                (
                    _args: any[],
                    result: any,
                ) => {
                    if (!result) {
                        return result;
                    }

                    return locallyEditedMessage(
                        result,
                    );
                },
            );

        cleanup(unpatch);
    }


    if (
        typeof MessageStore.getMessages ===
        "function"
    ) {
        const unpatch =
            patcher.after(
                MessageStore,
                "getMessages",
                (
                    _args: any[],
                    result: any,
                ) => {
                    if (!result) {
                        return result;
                    }


                    if (
                        Array.isArray(result)
                    ) {
                        return result.map(
                            locallyEditedMessage,
                        );
                    }


                    if (
                        typeof result.toArray ===
                        "function"
                    ) {
                        const array =
                            result.toArray();

                        return array.map(
                            locallyEditedMessage,
                        );
                    }


                    return result;
                },
            );

        cleanup(unpatch);
    }
}


/* ============================================================
 * PLUGIN
 * ============================================================
 */

export default plugin({
    start({ cleanup }) {
        console.log(
            "[LocalMessageEdit] Starting...",
        );


        /*
         * Try to locate the modules immediately.
         */

        if (!findModules()) {
            console.warn(
                "[LocalMessageEdit] Required modules aren't loaded yet.",
            );

            /*
             * Wait for MessageStore.
             */

            const stop =
                waitForModules(
                    filters.withProps(
                        "getMessages",
                    ),

                    () => {
                        findModules();

                        patchMessageStore(
                            cleanup,
                        );

                        patchMessageActionSheet(
                            cleanup,
                        );

                        stop();
                    },
                );

            cleanup(stop);

            return;
        }


        /*
         * Patch message retrieval.
         */

        patchMessageStore(
            cleanup,
        );


        /*
         * Patch the long-press action sheet.
         */

        patchMessageActionSheet(
            cleanup,
        );


        /*
         * Mount the editor UI.
         *
         * The exact mount mechanism depends on the
         * React root exposed by the current Revenge Next
         * version.
         */

        mountEditorUI(
            cleanup,
        );


        console.log(
            "[LocalMessageEdit] Started.",
        );
    },
});


/* ============================================================
 * EDITOR UI MOUNT
 * ============================================================
 */

function mountEditorUI(
    cleanup: (fn: () => void) => void,
) {
    /*
     * Revenge Next versions expose their React tree
     * differently.
     *
     * We first try to find an application/root component.
     */

    const [RootComponent] =
        lookupModule(
            filters.withProps(
                "render",
            ),
        );

    if (!RootComponent) {
        console.warn(
            "[LocalMessageEdit] React root not found.",
        );

        return;
    }


    const {
        React,
    } = getReactModules();

    if (!React) {
        return;
    }


    /*
     * Patch the root render and append our modal.
     */

    if (
        typeof RootComponent.render !==
        "function"
    ) {
        return;
    }


    const unpatch =
        patcher.after(
            RootComponent,
            "render",
            (
                _args: any[],
                tree: any,
            ) => {
                try {
                    /*
                     * The modal manages its own visibility,
                     * so it can safely remain mounted.
                     */

                    if (
                        Array.isArray(tree)
                    ) {
                        tree.push(
                            React.createElement(
                                EditorModal,
                                {
                                    key:
                                        "local-message-edit-modal",
                                },
                            ),
                        );
                    }
                } catch (error) {
                    console.error(
                        "[LocalMessageEdit] UI mount failed:",
                        error,
                    );
                }

                return tree;
            },
        );


    cleanup(unpatch);
}
