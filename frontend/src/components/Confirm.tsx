import type { ReactElement, ReactNode } from "react";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./Button";
import s from "./Confirm.module.css";

type Props = {
  /** The button that opens the dialog: our <Button> (a react-aria-components Button). */
  children: ReactElement;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
};

/** Asks before doing something hard to undo. Shown as a sheet from the bottom of the screen. */
export function Confirm({ children, title, message, confirmLabel, onConfirm }: Props) {
  return (
    <DialogTrigger>
      {children}
      <ModalOverlay isDismissable className={s.overlay}>
        <Modal className={s.sheet}>
          <Dialog role="alertdialog" className={s.dialog}>
            {({ close }) => (
              <>
                <Heading slot="title" className={s.title}>
                  {title}
                </Heading>
                <p className={s.message}>{message}</p>
                <div className={s.actions}>
                  <Button variant="outline" onPress={close} autoFocus>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => {
                      onConfirm();
                      close();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
