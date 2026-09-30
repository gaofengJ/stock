#define _GNU_SOURCE
#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>

/* Linux 4.4 has no x86_64 syscalls >=327. Modern libc expects ENOSYS
 * for feature detection, while Docker 18's older outer filter returns
 * EPERM. A more recently installed ERRNO filter supplies ENOSYS and
 * preserves the outer filter's restrictions on every older syscall.
 * This filter never enables a syscall and is inherited across exec.
 */
int main(int argc, char **argv) {
    if (argc < 2) { fputs("compat: command required\n", stderr); return 64; }
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 327, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ENOSYS),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog program = {sizeof(filter) / sizeof(filter[0]), filter};
    if (prctl(PR_SET_NO_NEW_PRIVS, 1L, 0L, 0L, 0L) ||
        prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program)) {
        perror("compat: install filter"); return 70;
    }
    execvp(argv[1], &argv[1]);
    perror("compat: exec"); return 71;
}
