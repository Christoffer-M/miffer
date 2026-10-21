import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { canPush, useSetPush } from "../mutations/household";
import { meQuery } from "../queries/household";
import { Button } from "./Button";
import s from "./Confirm.module.css";
import ui from "../ui.module.css";

/**
 * Asks to turn on notifications as soon as this phone is in a household, and again each time the
 * app opens until they're on. The browser's own prompt only shows from a tap (iPhones insist), so
 * this sheet's button is that tap. Once the browser has blocked them it can't ask any more; the
 * Us screen explains how to allow them.
 */
export function AskForNotifications() {
  const { data } = useQuery(meQuery);
  const setPush = useSetPush(data?.pushKey);
  const [notNow, setNotNow] = useState(false); // until the app opens again

  const ask =
    !notNow && canPush && !!data?.pushKey && !data.pushOn && Notification.permission !== "denied";

  return (
    <ModalOverlay isOpen={ask} onOpenChange={(open) => !open && setNotNow(true)} isDismissable className={s.overlay}>
      <Modal className={s.sheet}>
        <Dialog className={s.dialog}>
          <Heading slot="title" className={s.title}>
            Know when something's added?
          </Heading>
          <p className={s.message}>Get a notification when someone in your household adds to the list.</p>
          {setPush.error && <p className={ui.error}>{setPush.error.message}</p>}
          <div className={s.actions}>
            <Button variant="outline" onPress={() => setNotNow(true)}>
              Not now
            </Button>
            <Button onPress={() => setPush.mutate(true)} isDisabled={setPush.isPending}>
              Turn on
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
